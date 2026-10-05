@echo off
chcp 65001 >nul
title 抽奖系统服务
echo.
echo   ============================================
echo      抽奖系统 正在启动...
echo   ============================================
echo.
node "%~dp0server.js"
echo.
echo   服务已停止，按任意键关闭窗口。
pause >nul
