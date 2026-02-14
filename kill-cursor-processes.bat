@echo off
echo Killing Cursor-related processes...
taskkill /F /IM Cursor.exe 2>nul && echo Killed Cursor.exe
taskkill /F /IM cursor-agent.exe 2>nul && echo Killed cursor-agent.exe
taskkill /F /IM node.exe 2>nul && echo Killed node.exe (all - close other Node apps first if needed)
echo Done. Reopen Cursor now.
pause
