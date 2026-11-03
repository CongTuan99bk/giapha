@echo off
rem Chay server Gia Pha Coi Nguon tren Windows: bam dup file nay.
rem Can: Docker Desktop dang chay, Node.js va pnpm (xem docs/TRIEN-KHAI.md).
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   GIA PHA COI NGUON - chay server
echo   1. Du lieu MAU (gia) - xoa va tao lai moi lan, de thu hoac demo
echo   2. Du lieu THAT - sao luu, chay ban moi nhat, giu nguyen du lieu
echo   3. Du lieu THAT, chi xem tren may nay (khong mo link chia se)
echo.
set /p CHON=Chon 1, 2 hoac 3 roi bam Enter: 
if "%CHON%"=="1" call pnpm.cmd server --mau
if "%CHON%"=="2" call pnpm.cmd server --that
if "%CHON%"=="3" call pnpm.cmd server --that --khong-link
echo.
pause
