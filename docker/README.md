# Docker 部署指南

本目录包含 MySQL MCP 服务器的 Docker 配置文件。

## 📁 文件说明

- `Dockerfile` - MCP 服务器的容器镜像构建配置
- `docker-compose.yml` - 完整的 MCP 服务器 + MySQL 数据库编排配置
- `.dockerignore` - 构建镜像时忽略的文件列表

## 🚀 快速开始

### 方式 1: 使用 Docker Compose（推荐）

最简单的方式是同时启动 MCP 服务器和 MySQL 数据库：

```bash
# 进入 docker 目录
cd docker

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f mcp-server

# 停止服务
docker-compose down
```

这将启动：

- **MySQL 8.0** - 在端口 3306
- **MCP Server** - 连接到 MySQL，使用 stdio 模式

### 方式 2: 只构建 MCP 服务器镜像

如果你已经有运行的 MySQL 实例：

```bash
# 构建镜像
docker build -t mcp-server-mysql:latest -f docker/Dockerfile .

# 运行容器
docker run -d \
  --name mcp-server \
  -e MYSQL_HOST=your-mysql-host \
  -e MYSQL_PORT=3306 \
  -e MYSQL_USER=your-user \
  -e MYSQL_PASS=your-password \
  -e MYSQL_DB=your-database \
  -e TABLE_WRITE_WHITELIST="your_db.*" \
  mcp-server-mysql:latest
```

## 🔧 环境变量配置

在 `docker-compose.yml` 或运行命令中配置以下变量：

### MySQL 连接配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MYSQL_HOST` | MySQL 主机地址 | `127.0.0.1` |
| `MYSQL_PORT` | MySQL 端口 | `3306` |
| `MYSQL_USER` | MySQL 用户名 | `root` |
| `MYSQL_PASS` | MySQL 密码 | (空) |
| `MYSQL_DB` | 数据库名称 | `db` |

### 权限控制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TABLE_WRITE_WHITELIST` | 允许写入的表列表 | (空 - 只读) |
| `ENABLE_LOGGING` | 启用日志输出 | `false` |

### 远程 MCP 模式（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `IS_REMOTE_MCP` | 启用 HTTP 模式 | `false` |
| `REMOTE_SECRET_KEY` | API 密钥 | - |
| `PORT` | HTTP 端口 | `3000` |

## 📝 权限白名单示例

```yaml
# 允许所有表
TABLE_WRITE_WHITELIST: "*.*"

# 允许特定数据库的所有表
TABLE_WRITE_WHITELIST: "mydb.*"

# 允许多个特定表
TABLE_WRITE_WHITELIST: "db.users,db.posts,db.logs"

# 使用通配符
TABLE_WRITE_WHITELIST: "*.logs,production.*"
```

## 🔍 故障排查

### 查看容器日志

```bash
# MCP 服务器日志
docker logs mcp-server-mysql

# MySQL 日志
docker logs mcp-mysql

# Docker Compose 所有日志
docker-compose logs
```

### 进入容器调试

```bash
# 进入 MCP 服务器容器
docker exec -it mcp-server-mysql sh

# 进入 MySQL 容器
docker exec -it mcp-mysql mysql -uroot -prootpassword
```

### 重启服务

```bash
# 重启单个服务
docker-compose restart mcp-server

# 重启所有服务
docker-compose restart
```

## 🏗️ 自定义构建

### 使用不同的 Node.js 版本

编辑 `Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
# 或
FROM node:21-alpine AS builder
```

### 添加自定义依赖

```dockerfile
# 在 Dockerfile 中添加
RUN apk add --no-cache your-package
```

## 📊 资源限制

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  mcp-server:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## 🔐 安全建议

1. **不要在镜像中包含敏感信息**
   - 使用环境变量或 secrets 管理密码
   - 不要将 `.env` 文件复制到镜像中

2. **使用非 root 用户运行**

   ```dockerfile
   RUN addgroup -g 1001 -S nodejs
   RUN adduser -S nodejs -u 1001
   USER nodejs
   ```

3. **限制网络访问**
   - 只暴露必要的端口
   - 使用 Docker 网络隔离

4. **定期更新基础镜像**

   ```bash
   docker pull node:22-alpine
   docker build --no-cache -t mcp-server-mysql:latest -f docker/Dockerfile .
   ```

## 📚 相关文档

- [主 README](../README.md) - 项目主文档
- [多数据库模式](../docs/README-MULTI-DB.md) - 多数据库配置说明
- [项目设置指南](../docs/PROJECT_SETUP_GUIDE.md) - 详细配置说明

## 🆘 获取帮助

如果遇到问题：

1. 检查 [主 README](../README.md) 中的故障排查部分
2. 查看 GitHub Issues
3. 提交新的 Issue 并附上日志
