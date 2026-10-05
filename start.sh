#!/bin/sh
# 抽奖系统启动脚本（Linux / macOS）
cd "$(dirname "$0")"
export PORT="${PORT:-8080}"
echo "抽奖系统正在启动，端口 $PORT ..."
exec node server.js
