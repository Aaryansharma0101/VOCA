[CmdletBinding()]
param(
    [switch]$Stop,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Tools = Join-Path $Root "tools"
$RunDir = Join-Path $Root ".run"
$LogDir = Join-Path $RunDir "logs"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Cloudflared = Join-Path $Tools "cloudflared.exe"
$TunnelLog = Join-Path $LogDir "cloudflared.err.log"
$Curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
$TunnelTarget = "http://127.0.0.1:3001"
$BackendHealth = "http://127.0.0.1:8000/health"
$FrontendUrl = "http://127.0.0.1:3001/"

New-Item -ItemType Directory -Force -Path $RunDir, $LogDir, $Tools | Out-Null

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  [ok] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  [!!] $Message" -ForegroundColor Yellow
}

function Stop-Here {
    param([string]$Message)
    Write-Host "`nERROR: $Message" -ForegroundColor Red
    exit 1
}

function Test-Url {
    param([string]$Url, [int]$TimeoutSec = 3)
    if ($Curl) {
        $code = (& $Curl -s -o NUL -w "%{http_code}" --max-time $TimeoutSec $Url 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $code -match '^\d{3}$') {
            return ([int]$code -ge 200 -and [int]$code -lt 400)
        }
        return $false
    }
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
    } catch {
        return $false
    }
}

function Wait-Url {
    param([string]$Url, [int]$Seconds, [string]$Label = "the service")
    $deadline = (Get-Date).AddSeconds($Seconds)
    $nextNotice = Get-Date
    while ((Get-Date) -lt $deadline) {
        if (Test-Url -Url $Url) {
            return $true
        }
        if ((Get-Date) -ge $nextNotice) {
            Write-Host "    waiting for $Label..." -ForegroundColor DarkGray
            $nextNotice = (Get-Date).AddSeconds(15)
        }
        Start-Sleep -Milliseconds 750
    }
    return $false
}

function Get-PortPid {
    param([int]$Port)
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -First 1
        if ($connection) {
            return [int]$connection.OwningProcess
        }
    } catch {
        $line = netstat -ano |
            Select-String -Pattern ":$Port\s+\S+\s+LISTENING\s+(\d+)" |
            Select-Object -First 1
        if ($line -and $line.Matches.Count -gt 0) {
            return [int]$line.Matches[0].Groups[1].Value
        }
    }
    return $null
}

function Save-Pid {
    param([string]$Name, [int]$ProcessId)
    Set-Content -Path (Join-Path $RunDir "$Name.pid") -Value $ProcessId -Encoding ASCII
}

function Get-SavedPid {
    param([string]$Name)
    $file = Join-Path $RunDir "$Name.pid"
    if (-not (Test-Path $file)) {
        return $null
    }
    $raw = Get-Content -Path $file -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Remove-Item $file -ErrorAction SilentlyContinue
        return $null
    }
    $raw = $raw.Trim()
    if ($raw -match '^\d+$') {
        $saved = [int]$raw
        if (Get-Process -Id $saved -ErrorAction SilentlyContinue) {
            return $saved
        }
    }
    Remove-Item $file -ErrorAction SilentlyContinue
    return $null
}

function Stop-Tree {
    param([int]$ProcessId)
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function Remove-PidFile {
    param([string]$Name)
    Remove-Item (Join-Path $RunDir "$Name.pid") -ErrorAction SilentlyContinue
}

function Show-Tail {
    param([string]$Path, [int]$Lines = 20)
    if (Test-Path $Path) {
        Write-Host "    --- $Path" -ForegroundColor DarkGray
        Get-Content -Path $Path -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "    $_" -ForegroundColor DarkGray
        }
    }
}

function Get-TunnelUrl {
    param([string]$Path = $TunnelLog)
    if (-not (Test-Path $Path)) {
        return $null
    }
    $text = Get-Content -Path $Path -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }
    $found = [regex]::Matches($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($found.Count -gt 0) {
        return $found[$found.Count - 1].Value
    }
    return $null
}

function Start-Background {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )
    $stdout = Join-Path $LogDir "$Name.out.log"
    $stderr = Join-Path $LogDir "$Name.err.log"
    Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden `
        -PassThru
    Save-Pid -Name $Name -ProcessId $process.Id
    return $process
}

# ---------------------------------------------------------------------------
# Stop
# ---------------------------------------------------------------------------
if ($Stop) {
    Write-Step "Stopping Voca"
    $stopped = $false

    foreach ($name in @("frontend", "backend", "cloudflared")) {
        $saved = Get-SavedPid -Name $name
        if ($saved) {
            Stop-Tree -ProcessId $saved
            Remove-PidFile -Name $name
            Write-Ok "stopped $name (PID $saved)"
            $stopped = $true
        }
    }

    $projectTunnels = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*127.0.0.1:3001*" }
    foreach ($process in $projectTunnels) {
        Stop-Tree -ProcessId $process.ProcessId
        Write-Ok "stopped cloudflared (PID $($process.ProcessId))"
        $stopped = $true
    }

    foreach ($port in @(3001, 8000)) {
        $listener = Get-PortPid -Port $port
        if ($listener) {
            $info = Get-CimInstance Win32_Process -Filter "ProcessId=$listener" -ErrorAction SilentlyContinue
            if ($info -and ($info.CommandLine -match 'voca' -or $info.CommandLine -match 'uvicorn app\.main')) {
                Stop-Tree -ProcessId $listener
                Write-Ok "stopped process on port $port (PID $listener)"
                $stopped = $true
            }
        }
    }

    if (-not $stopped) {
        Write-Warn "Nothing was running."
    }
    Write-Host "`nVoca stopped." -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------
Write-Step "Checking prerequisites"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-Here "Node.js is not on PATH. Install Node.js 18 or newer."
}

if (-not (Test-Path $Python)) {
    Write-Step "Creating the backend virtual environment (first run)"
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        Stop-Here "Python 3.11+ is not on PATH. Install Python and try again."
    }
    & $pythonCommand.Source -m venv (Join-Path $Backend ".venv")
    if ($LASTEXITCODE -ne 0) {
        Stop-Here "Could not create backend/.venv."
    }
}

& $Python -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Step "Installing backend dependencies (first run)"
    & $Python -m pip install --upgrade pip
    & $Python -m pip install -r (Join-Path $Backend "requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        Stop-Here "Backend dependency installation failed."
    }
}

if (-not (Test-Path (Join-Path $Frontend "node_modules\next"))) {
    Write-Step "Installing frontend dependencies (first run)"
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    }
    if (-not $npmCommand) {
        Stop-Here "npm is not on PATH. Install Node.js 18 or newer."
    }
    Push-Location $Frontend
    try {
        & $npmCommand.Source install
        if ($LASTEXITCODE -ne 0) {
            Stop-Here "npm install failed."
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $Cloudflared)) {
    Write-Step "Downloading cloudflared (first run)"
    Invoke-WebRequest `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $Cloudflared
}

$envFile = Join-Path $Root ".env"
$backendEnvFile = Join-Path $Backend ".env"
if (-not (Test-Path $envFile) -and -not (Test-Path $backendEnvFile)) {
    Copy-Item (Join-Path $Root ".env.example") $envFile
    Write-Warn "Created voca/.env from the template. Add LLM_API_KEY before using Understand or Plan."
}

# --- Backend ---------------------------------------------------------------
Write-Step "Backend"
if (Test-Url -Url $BackendHealth) {
    $listener = Get-PortPid -Port 8000
    if ($listener) {
        Save-Pid -Name "backend" -ProcessId $listener
    }
    Write-Ok "already running at http://127.0.0.1:8000"
} else {
    $occupied = Get-PortPid -Port 8000
    if ($occupied) {
        Stop-Here "Port 8000 is in use by PID $occupied, but /health did not answer. Stop that process and try again."
    }
    Start-Background `
        -Name "backend" `
        -FilePath $Python `
        -Arguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $Backend | Out-Null
    if (-not (Wait-Url -Url $BackendHealth -Seconds 60 -Label "the backend")) {
        Show-Tail (Join-Path $LogDir "backend.err.log")
        Stop-Here "The backend did not become healthy in 60 seconds."
    }
    $listener = Get-PortPid -Port 8000
    if ($listener) {
        Save-Pid -Name "backend" -ProcessId $listener
    }
    Write-Ok "started at http://127.0.0.1:8000"
}

try {
    if ($Curl) {
        $health = ((& $Curl -s --max-time 5 $BackendHealth | Out-String) | ConvertFrom-Json)
    } else {
        $health = Invoke-RestMethod -Uri $BackendHealth -TimeoutSec 5
    }
    if (-not $health.llm_configured) {
        Write-Warn "LLM_API_KEY is not configured; Understand and Plan will fail until it is set in voca/.env."
    }
} catch {
    Write-Warn "Could not read the backend health response."
}

# --- Frontend --------------------------------------------------------------
Write-Step "Frontend"
if (Test-Url -Url $FrontendUrl) {
    $listener = Get-PortPid -Port 3001
    if ($listener) {
        Save-Pid -Name "frontend" -ProcessId $listener
    }
    Write-Ok "already running at http://127.0.0.1:3001"
} else {
    $occupied = Get-PortPid -Port 3001
    if ($occupied) {
        Stop-Here "Port 3001 is in use by PID $occupied, but the page did not answer. Stop that process and try again."
    }
    $node = (Get-Command node).Source
    Start-Background `
        -Name "frontend" `
        -FilePath $node `
        -Arguments @("node_modules/next/dist/bin/next", "dev", "-p", "3001") `
        -WorkingDirectory $Frontend | Out-Null
    if (-not (Wait-Url -Url $FrontendUrl -Seconds 120 -Label "the frontend (the first compile can take a while)")) {
        Show-Tail (Join-Path $LogDir "frontend.err.log")
        Stop-Here "The frontend did not start in 120 seconds. If the log mentions a corrupt .next folder, delete voca/frontend/.next and run this again."
    }
    $listener = Get-PortPid -Port 3001
    if ($listener) {
        Save-Pid -Name "frontend" -ProcessId $listener
    }
    Write-Ok "started at http://127.0.0.1:3001"
}

# --- Public tunnel ---------------------------------------------------------
Write-Step "Public tunnel"
$tunnelUrl = Get-TunnelUrl -Path $TunnelLog
if (-not $tunnelUrl) {
    $tunnelUrl = Get-TunnelUrl -Path (Join-Path $Root "cf.err.log")
}

$projectTunnels = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*127.0.0.1:3001*" }

if ($tunnelUrl -and (Test-Url -Url "$tunnelUrl/api/health" -TimeoutSec 10)) {
    $existing = $projectTunnels | Select-Object -First 1
    if ($existing) {
        Save-Pid -Name "cloudflared" -ProcessId $existing.ProcessId
    }
    Write-Ok "already running at $tunnelUrl"
} else {
    foreach ($process in $projectTunnels) {
        Stop-Tree -ProcessId $process.ProcessId
    }
    Start-Sleep -Milliseconds 500

    Start-Background `
        -Name "cloudflared" `
        -FilePath $Cloudflared `
        -Arguments @("tunnel", "--url", $TunnelTarget, "--no-autoupdate", "--protocol", "http2") `
        -WorkingDirectory $Root | Out-Null

    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $tunnelUrl = Get-TunnelUrl -Path $TunnelLog
        if ($tunnelUrl) {
            break
        }
        Start-Sleep -Milliseconds 800
    }

    if (-not $tunnelUrl) {
        Show-Tail $TunnelLog 30
        Stop-Here "Cloudflare did not return a public URL. Check the tunnel log above."
    }

    # Save it before the reachability check: the URL is valid even while
    # Cloudflare is still propagating the new hostname.
    Set-Content -Path (Join-Path $RunDir "public-url.txt") -Value $tunnelUrl -Encoding ASCII

    if (Wait-Url -Url "$tunnelUrl/api/health" -Seconds 90 -Label "Cloudflare to route the public URL") {
        Write-Ok "started at $tunnelUrl"
    } else {
        Write-Warn "The tunnel URL was created, but it is not reachable yet. Give it a minute; the local app is already up."
        Show-Tail $TunnelLog 20
    }
}

Set-Content -Path (Join-Path $RunDir "public-url.txt") -Value $tunnelUrl -Encoding ASCII

Write-Host ""
Write-Host "Voca is ready." -ForegroundColor Green
Write-Host "  Local:  http://127.0.0.1:3001"
Write-Host "  Public: $tunnelUrl"
Write-Host ""
Write-Host "The public URL works only while this PC and these processes stay running."
Write-Host "The URL changes if the tunnel restarts. Run stop.bat to shut everything down."

if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:3001"
}
