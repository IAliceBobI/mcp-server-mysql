#!/bin/bash
# Docker Compose 快速启动脚本

set -e

echo "🐳 MySQL MCP Server - Docker 启动脚本"
echo "======================================"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ 错误: 未找到 Docker Compose，请先安装 Docker Compose"
    exit 1
fi

# 进入 docker 目录
cd "$(dirname "$0")"

echo "📋 当前配置:"
echo "  - MySQL 端口: 3306"
echo "  - 数据库: mcp_test"
echo "  - 用户: mcp_user"
echo ""

# 询问用户操作
echo "请选择操作:"
echo "  1) 启动服务 (docker-compose up -d)"
echo "  2) 查看日志 (docker-compose logs -f)"
echo "  3) 停止服务 (docker-compose down)"
echo "  4) 重启服务 (docker-compose restart)"
echo "  5) 查看状态 (docker-compose ps)"
echo ""
read -p "请输入选项 (1-5): " choice

case $choice in
    1)
        echo "🚀 启动服务..."
        docker-compose up -d
        echo ""
        echo "✅ 服务已启动!"
        echo ""
        echo "查看日志: docker-compose logs -f"
        echo "停止服务: docker-compose down"
        ;;
    2)
        echo "📋 查看日志 (Ctrl+C 退出)..."
        docker-compose logs -f
        ;;
    3)
        echo "🛑 停止服务..."
        docker-compose down
        echo "✅ 服务已停止"
        ;;
    4)
        echo "🔄 重启服务..."
        docker-compose restart
        echo "✅ 服务已重启"
        ;;
    5)
        echo "📊 服务状态:"
        docker-compose ps
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac
