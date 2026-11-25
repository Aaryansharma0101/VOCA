#!/usr/bin/env bash
# Check for em dashes (—) and en dashes (–) in source files.
# Exits with code 1 if any are found.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Files to check (exclude node_modules, .git, and build artifacts)
FIND_ARGS=(
  -type f
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" -o -name "*.json" -o -name "*.md" \)
  -not -path "*/node_modules/*"
  -not -path "*/.git/*"
  -not -path "*/.next/*"
  -not -path "*/dist/*"
  -not -path "*/build/*"
  -not -path "*/__pycache__/*"
)

echo "Checking for em dashes (—) and en dashes (–) in source files..."

# Search for em dashes
EM_DASHES=$(find "$ROOT_DIR" "${FIND_ARGS[@]}" -exec grep -l "—" {} \; 2>/dev/null || true)
if [ -n "$EM_DASHES" ]; then
  echo "FAIL: Found em dashes (—) in:"
  find "$ROOT_DIR" "${FIND_ARGS[@]}" -exec grep -n "—" {} \; 2>/dev/null | head -50
  exit 1
fi

# Search for en dashes
EN_DASHES=$(find "$ROOT_DIR" "${FIND_ARGS[@]}" -exec grep -l "–" {} \; 2>/dev/null || true)
if [ -n "$EN_DASHES" ]; then
  echo "FAIL: Found en dashes (–) in:"
  find "$ROOT_DIR" "${FIND_ARGS[@]}" -exec grep -n "–" {} \; 2>/dev/null | head -50
  exit 1
fi

echo "PASS: No em dashes or en dashes found."
exit 0