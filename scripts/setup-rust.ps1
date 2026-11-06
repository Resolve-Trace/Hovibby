#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Sets up the correct Rust toolchain for Soroban contract compilation.

.DESCRIPTION
    The Soroban contract requires:
    - Rust 1.84+ (installed via rustup, NOT the standalone installer)
    - wasm32v1-none target
    - Stellar CLI >= 28

    This script checks for the required tools and provides installation instructions.
#>

Write-Host "=== ResolveTrace Rust Toolchain Setup ===" -ForegroundColor Cyan

# Check for rustup
$rustup = Get-Command rustup -ErrorAction SilentlyContinue
if (-not $rustup) {
    Write-Host ""
    Write-Host "rustup is NOT installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "The Soroban contract requires Rust installed via rustup (not the standalone installer)."
    Write-Host "Install rustup from: https://rustup.rs/"
    Write-Host ""
    Write-Host "After installing rustup, run:"
    Write-Host "  rustup default stable"
    Write-Host "  rustup target add wasm32v1-none"
    Write-Host ""
    Write-Host "NOTE: If you have the standalone Rust LLVM installer, it does NOT include"
    Write-Host "  rustup or the wasm32v1-none target. You need the rustup-based installation."
    exit 1
}

Write-Host "rustup found: $(rustup --version)" -ForegroundColor Green

# Check Rust version
$rustcVersion = rustc --version
Write-Host "rustc: $rustcVersion"

# Check for wasm32v1-none target
$targets = rustup target list --installed 2>$null
if ($targets -match "wasm32v1-none") {
    Write-Host "wasm32v1-none target: installed" -ForegroundColor Green
} else {
    Write-Host "wasm32v1-none target: NOT installed" -ForegroundColor Yellow
    Write-Host "Installing wasm32v1-none target..."
    rustup target add wasm32v1-none
    if ($LASTEXITCODE -eq 0) {
        Write-Host "wasm32v1-none installed successfully." -ForegroundColor Green
    } else {
        Write-Host "Failed to install wasm32v1-none. Check your rustup installation." -ForegroundColor Red
        exit 1
    }
}

# Check Stellar CLI
$stellar = Get-Command stellar -ErrorAction SilentlyContinue
if ($stellar) {
    Write-Host "Stellar CLI: $(stellar --version | Select-Object -First 1)" -ForegroundColor Green
} else {
    Write-Host "Stellar CLI: NOT found" -ForegroundColor Red
    Write-Host "Install from: https://developers.stellar.org/docs/tools/developer-tools/stellar-cli"
}

Write-Host ""
Write-Host "Setup complete. You can now build the contract with:"
Write-Host "  cd contracts/resolvetrace_registry"
Write-Host "  stellar contract build"
