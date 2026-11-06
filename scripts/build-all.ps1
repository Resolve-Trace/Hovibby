#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build all ResolveTrace packages and the web application.

.DESCRIPTION
    Builds in order:
    1. @resolvetrace/protocol
    2. @resolvetrace/storage
    3. @resolvetrace/sdk
    4. apps/web (Next.js)
    5. apps/verifier-cli (TypeScript)
    
    The Soroban contract is NOT built here — it requires rustup with wasm32v1-none.
    Run scripts/setup-rust.ps1 first, then: stellar contract build --package resolvetrace_registry
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$node = "C:\Program Files\nodejs\node.exe"
$tsc = "$root\node_modules\typescript\bin\tsc"

function Run-Step {
    param([string]$label, [string]$cmd, [string]$cwd = $root)
    Write-Host ""
    Write-Host "--- $label ---" -ForegroundColor Cyan
    $result = & $node $cmd.Split(" ") 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $label" -ForegroundColor Red
        $result | Write-Host
        exit 1
    }
    Write-Host "OK: $label" -ForegroundColor Green
}

Write-Host "=== ResolveTrace Build ===" -ForegroundColor Cyan
Write-Host "Root: $root"

# Build protocol
& $node $tsc -p "$root\packages\protocol\tsconfig.json"
if ($LASTEXITCODE -ne 0) { Write-Host "Protocol build failed" -ForegroundColor Red; exit 1 }
Write-Host "protocol: OK" -ForegroundColor Green

# Build storage
& $node $tsc -p "$root\packages\storage\tsconfig.json"
if ($LASTEXITCODE -ne 0) { Write-Host "Storage build failed" -ForegroundColor Red; exit 1 }
Write-Host "storage:  OK" -ForegroundColor Green

# Build SDK
& $node $tsc -p "$root\packages\sdk\tsconfig.json"
if ($LASTEXITCODE -ne 0) { Write-Host "SDK build failed" -ForegroundColor Red; exit 1 }
Write-Host "sdk:      OK" -ForegroundColor Green

# Build verifier CLI
& $node $tsc -p "$root\apps\verifier-cli\tsconfig.json"
if ($LASTEXITCODE -ne 0) { Write-Host "Verifier CLI build failed" -ForegroundColor Red; exit 1 }
Write-Host "verifier: OK" -ForegroundColor Green

# Build Next.js
Write-Host ""
Write-Host "--- Next.js build ---" -ForegroundColor Cyan
Push-Location "$root\apps\web"
& $node "..\..\node_modules\next\dist\bin\next" build
if ($LASTEXITCODE -ne 0) { Write-Host "Next.js build failed" -ForegroundColor Red; Pop-Location; exit 1 }
Pop-Location
Write-Host "web:      OK" -ForegroundColor Green

Write-Host ""
Write-Host "=== Build complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "To run tests:"
Write-Host "  cd packages/protocol"
Write-Host "  node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --runInBand"
Write-Host ""
Write-Host "To start dev server:"
Write-Host "  cd apps/web && node ../../node_modules/next/dist/bin/next dev"
