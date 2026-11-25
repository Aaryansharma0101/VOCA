#!/usr/bin/env pwsh
# Check for em dashes (—) and en dashes (–) in source files.
# Exits with code 1 if any are found.

$RootDir = Split-Path -Parent $PSScriptRoot | Split-Path -Parent

$Files = Get-ChildItem -Recurse -Path $RootDir -Include "*.ts","*.tsx","*.py","*.json","*.md" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "node_modules|\.git|\.next|dist|build|__pycache__" }

$Fail = $false

$EmDash = [char]0x2014
$EnDash = [char]0x2013

$EmDashes = $Files | Select-String $EmDash -ErrorAction SilentlyContinue
if ($EmDashes) {
    Write-Host "FAIL: Found em dashes in:" -ForegroundColor Red
    $EmDashes | Select-Object Path, LineNumber, Line | Format-Table -AutoSize | Out-Host
    $Fail = $true
}

$EnDashes = $Files | Select-String $EnDash -ErrorAction SilentlyContinue
if ($EnDashes) {
    Write-Host "FAIL: Found en dashes in:" -ForegroundColor Red
    $EnDashes | Select-Object Path, LineNumber, Line | Format-Table -AutoSize | Out-Host
    $Fail = $true
}

if ($Fail) {
    exit 1
} else {
    Write-Host "PASS: No em dashes or en dashes found." -ForegroundColor Green
    exit 0
}