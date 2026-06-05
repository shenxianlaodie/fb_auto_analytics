@echo off
for /f "tokens=5" %%i in ('netstat -ano ^| findstr ":3000.*LISTENING"') do taskkill /F /PID %%i >nul 2>&1
echo done
