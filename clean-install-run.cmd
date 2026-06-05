@echo off
echo Cleaning old install...
if exist node_modules rd /s /q node_modules
if exist package-lock.json del package-lock.json

echo Installing dependencies...
npm install

echo Starting Next.js...
npm run dev
pause
