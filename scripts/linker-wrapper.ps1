#!/usr/bin/env pwsh
# Linker wrapper that strips -flavor gnu arguments before passing to ld.lld.exe
# This is needed because the Rust gnullvm toolchain passes -flavor gnu to ld.lld.exe
# which already has the gnu flavor baked in (it's a wrapper around rust-lld.exe).

$lld = "C:\Program Files\Rust stable LLVM 1.99\lib\rustlib\x86_64-pc-windows-gnullvm\bin\gcc-ld\ld.lld.exe"

# Filter out -flavor and the following argument
$filteredArgs = @()
$skip = $false
foreach ($arg in $args) {
    if ($skip) {
        $skip = $false
        continue
    }
    if ($arg -eq "-flavor") {
        $skip = $true
        continue
    }
    $filteredArgs += $arg
}

& $lld @filteredArgs
exit $LASTEXITCODE
