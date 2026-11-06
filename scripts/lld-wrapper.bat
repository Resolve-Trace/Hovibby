@echo off
REM Linker wrapper for Rust gnullvm target on Windows
REM Filters -flavor gnu arguments before passing to rust-lld

set LLD="C:\Program Files\Rust stable LLVM 1.99\lib\rustlib\x86_64-pc-windows-gnullvm\bin\rust-lld.exe"
set ARGS=
set SKIP=0

:loop
if "%~1"=="" goto done
if "%SKIP%"=="1" (
    set SKIP=0
    shift
    goto loop
)
if "%~1"=="-flavor" (
    set SKIP=1
    shift
    goto loop
)
set ARGS=%ARGS% %1
shift
goto loop

:done
%LLD% -flavor gnu %ARGS%
