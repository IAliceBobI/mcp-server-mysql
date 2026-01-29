# MySQL MCP 服务器 - 增强权限版

> **🔐 增加了基于细粒度白名单的权限控制，兼顾最大安全性和灵活性**
> **原作者：** [@benborla29](https://github.com/benborla)
> **原始仓库：** [https://github.com/benborla/mcp-server-mysql](https://github.com/benborla/mcp-server-mysql)
> **许可证：** MIT

**🌐 Language / 语言:** [English](README.md) | [简体中文](README_CN.md)

## 基于 NodeJS 的 MySQL MCP 服务器

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/benborla/mcp-server-mysql)](https://archestra.ai/mcp-catalog/benborla__mcp-server-mysql)

### 🎯 与上游版本的主要区别

本项目在原版 mcp-server-mysql 基础上增加了**操作级权限精细控制**，在保持灵活性的同时提供更强的安全性：

#### ✨ **细粒度白名单权限系统**（核心增强功能）

- **7 个独立的操作白名单** - 分别控制 INSERT、UPDATE、DELETE、ALTER、DROP、TRUNCATE 操作
- **CREATE TABLE 无需白名单** - 允许自由创建表，便于开发工作流
- **通配符模式支持** - 支持如 `*.logs`、`production.*`、`dev.test_*` 等灵活的表匹配模式
- **安全优先设计** - 默认所有操作都是只读的，除非显式加入白名单
- **灵活配置格式** - 同时支持 JSON 数组和逗号分隔的字符串格式

**配置示例：**
```bash
# 允许向 production.users 和任何 *.logs 表插入数据
TABLE_INSERT_WHITELIST="production.users,*.logs"

# 仅允许在 production.users 表中更新数据
TABLE_UPDATE_WHITELIST="production.users"

# 仅允许从临时表删除数据
TABLE_DELETE_WHITELIST="*.temp_*"

# 不允许任何 DDL 操作（默认为空）
TABLE_DDL_ALTER_WHITELIST=""
TABLE_DDL_DROP_WHITELIST=""
TABLE_DDL_TRUNCATE_WHITELIST=""
```

**相比上游版本的优势：**
- ✅ **更灵活** - 可以允许 INSERT 但阻止 UPDATE/DELETE
- ✅ **更安全** - 每种操作类型都需要显式启用
- ✅ **更友好** - CREATE TABLE 无需白名单限制，适合开发
- ✅ **通配符支持** - 高效管理多表的权限

#### 其他增强功能

- ✅ **Claude Code 集成** - 针对 Anthropic Claude Code CLI 优化
- ✅ **SSH 隧道支持** - 内置对远程数据库的 SSH 隧道支持
- ✅ **自动启动/停止钩子** - Claude 启动/停止时自动管理隧道
- ✅ **多项目配置** - 轻松为不同项目配置不同数据库

### Claude Code 用户快速开始

1. **阅读设置指南**：查看 [docs/PROJECT_SETUP_GUIDE.md](docs/PROJECT_SETUP_GUIDE.md) 获取详细说明
2. **配置 SSH 隧道**：为远程数据库设置自动 SSH 隧道
3. **在 Claude 中使用**：与 Claude Code 无缝集成

这是一个通过 SSH 隧道访问 MySQL 数据库的 Model Context Protocol 服务器，使 Claude 和其他 LLM 能够安全地检查数据库架构和执行 SQL 查询。

### 📋 实用配置示例

#### 示例 1：只读模式（默认 - 最安全）
```bash
# 所有白名单为空 - 仅允许 SELECT 查询
TABLE_INSERT_WHITELIST=""
TABLE_UPDATE_WHITELIST=""
TABLE_DELETE_WHITELIST=""
TABLE_DDL_ALTER_WHITELIST=""
TABLE_DDL_DROP_WHITELIST=""
TABLE_DDL_TRUNCATE_WHITELIST=""
```

#### 示例 2：开发环境（CREATE + INSERT）
```bash
# 允许创建表和插入数据
# 但阻止意外的更新/删除/删除表操作
TABLE_INSERT_WHITELIST="dev.*"           # 可以向任何 dev 表插入
TABLE_UPDATE_WHITELIST=""                # 不允许 UPDATE
TABLE_DELETE_WHITELIST=""                # 不允许 DELETE
TABLE_DDL_ALTER_WHITELIST=""            # 不允许 ALTER
TABLE_DDL_DROP_WHITELIST=""             # 不允许 DROP
TABLE_DDL_TRUNCATE_WHITELIST=""         # 不允许 TRUNCATE
# CREATE TABLE 始终允许，无需白名单！
```

#### 示例 3：生产环境日志表（INSERT + TRUNCATE）
```bash
# 允许插入日志和定期清理
# 但阻止修改或删除表
TABLE_INSERT_WHITELIST="production.logs"        # 向 logs 表插入
TABLE_UPDATE_WHITELIST=""                       # 不允许 UPDATE
TABLE_DELETE_WHITELIST=""                       # 不允许 DELETE
TABLE_DDL_ALTER_WHITELIST=""                   # 不允许 ALTER
TABLE_DDL_DROP_WHITELIST=""                    # 不允许 DROP
TABLE_DDL_TRUNCATE_WHITELIST="production.logs" # 可以 TRUNCATE logs
```

#### 示例 4：测试环境（完整 DML，受限 DDL）
```bash
# 允许所有数据操作，但限制架构变更
TABLE_INSERT_WHITELIST="staging.*"
TABLE_UPDATE_WHITELIST="staging.*"
TABLE_DELETE_WHITELIST="staging.temp_*"      # 仅能从 temp 表删除
TABLE_DDL_ALTER_WHITELIST=""                 # 不允许 ALTER
TABLE_DDL_DROP_WHITELIST="staging.temp_*"    # 可以 DROP temp 表
TABLE_DDL_TRUNCATE_WHITELIST="staging.logs"  # 可以 TRUNCATE logs
```

#### 示例 5：使用逗号分隔格式（更简单）
```bash
# 替代格式：逗号分隔的字符串
TABLE_INSERT_WHITELIST='production.users,*.logs,dev.test_*'
TABLE_UPDATE_WHITELIST='production.users'
TABLE_DELETE_WHITELIST='*.temp_*'
TABLE_DDL_ALTER_WHITELIST=''
TABLE_DDL_DROP_WHITELIST=''
TABLE_DDL_TRUNCATE_WHITELIST='production.logs'
```

**核心优势：** 每种操作类型独立控制。你可以允许 INSERT 但阻止 UPDATE，或者允许对 logs 表进行 TRUNCATE 但阻止 DROP。这种细粒度控制是上游版本没有的！

## 目录

- [系统要求](#系统要求)
- [安装](#安装)
  - [使用 Smithery](#使用-smithery)
  - [使用 Cursor](#使用-cursor)
  - [使用 Codex CLI](#使用-codex-cli)
  - [使用 Claude Code](#使用-claude-code)
- [环境变量](#环境变量)
- [多数据库模式](#多数据库模式)
- [表白名单权限](#表白名单权限)
- [测试](#测试)
- [故障排除](#故障排除)

## 系统要求

- Node.js v20 或更高版本
- MySQL 5.7 或更高版本（推荐 MySQL 8.0+）
- 具有相应权限的 MySQL 用户
- 对于写操作：MySQL 用户需要 INSERT、UPDATE 和/或 DELETE 权限

## 安装

### 使用 Smithery

最常见的方式是访问这个网站：[https://smithery.ai/server/@benborla29/mcp-server-mysql](https://smithery.ai/server/@benborla29/mcp-server-mysql)

### 使用 Cursor

在 Cursor IDE 中，可以通过以下命令安装此 MCP 服务器：

1. 访问 [https://smithery.ai/server/@benborla29/mcp-server-mysql](https://smithery.ai/server/@benborla29/mcp-server-mysql)
2. 按照 Cursor 的说明操作

### 使用 Codex CLI

Codex CLI 的安装与下面的 Claude Code 类似：

```bash
codex mcp add mcp_server_mysql \
  --env MYSQL_HOST="127.0.0.1" \
  --env MYSQL_PORT="3306" \
  --env MYSQL_USER="root" \
  --env MYSQL_PASS="your_password" \
  --env MYSQL_DB="your_database" \
  --env TABLE_INSERT_WHITELIST="" \
  -- npx -y @benborla29/mcp-server-mysql
```

### 使用 Claude Code

#### 方式 1：从 Claude Desktop 导入（推荐）

如果你已经在 Claude Desktop 中配置了此 MCP 服务器，可以自动导入：

```bash
claude mcp add-from-claude-desktop
```

这将显示一个交互式对话框，你可以选择要导入的 `mcp_server_mysql` 服务器及其所有现有配置。

#### 方式 2：手动配置

**使用 NPM/PNPM 全局安装：**

首先全局安装包：

```bash
# 使用 npm
npm install -g @benborla29/mcp-server-mysql

# 使用 pnpm
pnpm add -g @benborla29/mcp-server-mysql
```

然后将服务器添加到 Claude Code：

```bash
claude mcp add mcp_server_mysql \
  -e MYSQL_HOST="127.0.0.1" \
  -e MYSQL_PORT="3306" \
  -e MYSQL_USER="root" \
  -e MYSQL_PASS="your_password" \
  -e MYSQL_DB="your_database" \
  -e TABLE_INSERT_WHITELIST="" \
  -e TABLE_UPDATE_WHITELIST="" \
  -e TABLE_DELETE_WHITELIST="" \
  -e TABLE_DDL_ALTER_WHITELIST="" \
  -e TABLE_DDL_DROP_WHITELIST="" \
  -e TABLE_DDL_TRUNCATE_WHITELIST="" \
  -- npx @benborla29/mcp-server-mysql
```

**使用本地仓库（用于开发）：**

如果你从克隆的仓库运行：

```bash
claude mcp add mcp_server_mysql \
  -e MYSQL_HOST="127.0.0.1" \
  -e MYSQL_PORT="3306" \
  -e MYSQL_USER="root" \
  -e MYSQL_PASS="your_password" \
  -e MYSQL_DB="your_database" \
  -e TABLE_INSERT_WHITELIST="" \
  -e TABLE_UPDATE_WHITELIST="" \
  -e TABLE_DELETE_WHITELIST="" \
  -e TABLE_DDL_ALTER_WHITELIST="" \
  -e TABLE_DDL_DROP_WHITELIST="" \
  -e TABLE_DDL_TRUNCATE_WHITELIST="" \
  -e PATH="/path/to/node/bin:/usr/bin:/bin" \
  -e NODE_PATH="/path/to/node/lib/node_modules" \
  -- /path/to/node /full/path/to/mcp-server-mysql/dist/index.js
```

替换以下内容：
- `/path/to/node` 为你的 Node.js 二进制路径（使用 `which node` 查找）
- `/full/path/to/mcp-server-mysql` 为克隆仓库的完整路径
- 更新 MySQL 凭据以匹配你的环境

**使用 Unix Socket 连接：**

对于使用 Unix socket 的本地 MySQL 实例：

```bash
claude mcp add mcp_server_mysql \
  -e MYSQL_SOCKET_PATH="/tmp/mysql.sock" \
  -e MYSQL_USER="root" \
  -e MYSQL_PASS="your_password" \
  -e MYSQL_DB="your_database" \
  -e TABLE_INSERT_WHITELIST="" \
  -e TABLE_UPDATE_WHITELIST="" \
  -e TABLE_DELETE_WHITELIST="" \
  -e TABLE_DDL_ALTER_WHITELIST="" \
  -e TABLE_DDL_DROP_WHITELIST="" \
  -e TABLE_DDL_TRUNCATE_WHITELIST="" \
  -- npx @benborla29/mcp-server-mysql
```

#### 选择合适的作用域

根据需求选择作用域：

```bash
# 本地作用域（默认）- 仅在当前项目中可用
claude mcp add mcp_server_mysql [选项...]

# 用户作用域 - 在所有项目中可用
claude mcp add mcp_server_mysql -s user [选项...]

# 项目作用域 - 通过 .mcp.json 与团队成员共享
claude mcp add mcp_server_mysql -s project [选项...]
```

对于有凭据的数据库服务器，建议使用 **本地** 或 **用户** 作用域以保护凭据隐私。

#### 验证配置

添加服务器后，验证配置是否正确：

```bash
# 列出所有配置的服务器
claude mcp list

# 获取 MySQL 服务器的详细信息
claude mcp get mcp_server_mysql

# 在 Claude Code 中检查服务器状态
/mcp
```

## 环境变量

### 数据库连接

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `MYSQL_HOST` | 否* | 127.0.0.1 | MySQL 主机地址 |
| `MYSQL_PORT` | 否* | 3306 | MySQL 端口 |
| `MYSQL_SOCKET_PATH` | 否* | - | Unix socket 路径（优先于 HOST/PORT） |
| `MYSQL_USER` | 是 | root | MySQL 用户名 |
| `MYSQL_PASS` | 是 | - | MySQL 密码 |
| `MYSQL_DB` | 否 | - | 数据库名称（留空启用多数据库模式） |
| `MYSQL_CONNECTION_STRING` | 否 | - | MySQL 连接字符串（覆盖单个连接变量） |

*如果使用 `MYSQL_CONNECTION_STRING` 则不需要

### 连接池配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_QUEUE_LIMIT` | 100 | 连接队列限制 |
| `MYSQL_CONNECT_TIMEOUT` | 10000 | 连接超时（毫秒） |
| `MYSQL_SSL` | false | 启用 SSL/TLS |
| `MYSQL_SSL_REJECT_UNAUTHORIZED` | true | SSL 证书验证 |
| `MYSQL_TIMEZONE` | - | MySQL 时区设置（如 'Z'、'+08:00'） |
| `MYSQL_DATE_STRINGS` | false | 将日期作为字符串返回 |

### 细粒度白名单权限

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TABLE_INSERT_WHITELIST` | "" | 允许 INSERT 的表列表（逗号分隔） |
| `TABLE_UPDATE_WHITELIST` | "" | 允许 UPDATE 的表列表（逗号分隔） |
| `TABLE_DELETE_WHITELIST` | "" | 允许 DELETE 的表列表（逗号分隔） |
| `TABLE_DDL_ALTER_WHITELIST` | "" | 允许 ALTER TABLE 的表列表（逗号分隔） |
| `TABLE_DDL_DROP_WHITELIST` | "" | 允许 DROP TABLE 的表列表（逗号分隔） |
| `TABLE_DDL_TRUNCATE_WHITELIST` | "" | 允许 TRUNCATE TABLE 的表列表（逗号分隔） |
| `MYSQL_DISABLE_READ_ONLY_TRANSACTIONS` | false | 禁用只读事务模式（用于 DDL） |

**格式：**
- 逗号分隔的字符串：`db1.table1,db2.table2,*.logs`
- 空字符串 = 无操作允许（只读模式）

**通配符支持：**
- `*.logs` - 任何数据库中的 `logs` 表
- `production.*` - `production` 数据库中的所有表
- `dev.test_*` - `dev` 数据库中以 `test_` 开头的所有表

### 多数据库模式

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MULTI_DB_WRITE_MODE` | false | 在多数据库模式下启用写操作 |
| `SCHEMA_PERMISSIONS` | - | 架构权限（格式：db1:true,db2:false） |

### 远程 MCP 模式

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `IS_REMOTE_MCP` | false | 启用远程 HTTP 模式 |
| `REMOTE_SECRET_KEY` | - | 远程模式的授权密钥 |
| `PORT` | 3000 | HTTP 服务器端口 |

### 调试

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ENABLE_LOGGING` | false | 启用详细日志记录 |

## 多数据库模式

当 `MYSQL_DB` 环境变量为空或未设置时，服务器以**多数据库模式**运行：

- 查询必须使用完全限定的表名（`database.table`）或 `USE` 语句
- 可以通过资源浏览所有可访问的架构
- 默认禁用写操作，除非设置 `MULTI_DB_WRITE_MODE=true`
- 支持架构特定权限

**多数据库模式示例：**

```sql
-- 查询时指定数据库
SELECT * FROM production.users WHERE id = 1;

-- 或使用 USE 语句
USE production;
SELECT * FROM users WHERE id = 1;
```

## 表白名单权限

本版本实现了**细粒度白名单权限系统**，为每种 SQL 操作类型提供独立控制。

### 工作原理

1. **默认行为**：所有操作都是只读的（SELECT）
2. **显式白名单**：必须将表添加到特定操作的白名单中
3. **CREATE TABLE 例外**：允许自由创建表（开发友好）
4. **安全验证**：阻止危险模式（如单个 `*`）

### 白名单环境变量

```bash
# DML 操作（数据操作语言）
TABLE_INSERT_WHITELIST="db.table,*.logs"
TABLE_UPDATE_WHITELIST="db.table"
TABLE_DELETE_WHITELIST="db.temp_*"

# DDL 操作（数据定义语言）
# 注意：CREATE TABLE 无需白名单，始终允许！
TABLE_DDL_ALTER_WHITELIST="db.table"
TABLE_DDL_DROP_WHITELIST="db.temp_*"
TABLE_DDL_TRUNCATE_WHITELIST="db.logs"
```

### 通配符模式

- `*.logs` - 匹配任何数据库中的 `logs` 表
- `production.*` - 匹配 `production` 数据库中的所有表
- `dev.test_*` - 匹配 `dev` 数据库中以 `test_` 开头的表
- `*` - ❌ 被阻止（太危险）

### 错误消息

当操作被拒绝时，你会收到清晰的错误消息：

```
❌ 操作被拒绝：UPDATE 操作不允许在表 'production.users' 上执行

该表不在 TABLE_UPDATE_WHITELIST 中。

执行的 SQL：
UPDATE production.users SET name = 'test' WHERE id = 1

请检查你的白名单配置。
```

## 测试

本项目使用 Vitest 进行测试。

### 设置测试数据库

```bash
# 创建测试数据库和用户
pnpm run setup:test:db
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试套件
pnpm test:unit          # 仅单元测试
pnpm test:integration   # 集成测试（需要 MySQL）
pnpm test:e2e          # 端到端测试

# 监视模式
pnpm test:watch

# 覆盖率报告
pnpm test:coverage
```

### 测试环境要求

- MySQL 服务器本地或远程运行
- 测试数据库用户：`mcp_test`，密码：`mcp_test_password`
- 测试数据库：`mcp_test`
- 通过 `.env.test` 文件配置

## 故障排除

### 连接问题

**问题**：无法连接到 MySQL

**解决方案**：
1. 检查 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASS` 是否正确
2. 确认 MySQL 服务正在运行
3. 验证用户权限：`SHOW GRANTS FOR 'username'@'host';`
4. 检查防火墙设置（对于远程连接）

### 权限错误

**问题**：操作被白名单拒绝

**解决方案**：
1. 检查表是否在正确的白名单中
2. 确认使用完全限定的表名（`database.table`）
3. 查看错误消息中的环境变量名称
4. 验证通配符模式匹配

### 只读事务错误

**问题**：DDL 操作在只读事务中失败

**解决方案**：
1. 设置 `MYSQL_DISABLE_READ_ONLY_TRANSACTIONS=true`
2. 或仅在允许 DDL 的环境中使用 DDL 操作

## 架构概述

### 核心组件

- **`index.ts`** - 主服务器文件，导出 `createMcpServer()` 函数
- **`src/config/index.ts`** - 配置和环境变量加载
- **`src/db/index.ts`** - 数据库连接池和查询执行
- **`src/db/permissions.ts`** - 白名单权限检查
- **`src/db/utils.ts`** - SQL 解析和工具函数

### MCP 协议实现

**资源**（数据库内省）：
- `ListResourcesRequest` - 返回所有可访问架构中的表
- `ReadResourceRequest` - 返回特定表的列元数据
- URI：`mysql://tables` 和 `mysql://tables/{tableName}`

**工具**（查询执行）：
- `mysql_query` - 执行 SQL 查询的单一工具
- 输入：`{ sql: string }`
- 输出：带有执行时间的 JSON 结果集
- 在查询执行前通过 `executeReadOnlyQuery` 强制权限检查

### 查询执行流程

1. 收到工具调用 → `index.ts` 中的 `CallToolRequestSchema` 处理程序
2. 调用 `executeReadOnlyQuery(sql)` 在 `src/db/index.ts` 中
3. 通过 `getQueryTypes()` 使用 `node-sql-parser` 解析查询类型
4. 通过 `extractTableFromQuery()` 提取完整表名进行权限检查
5. 检查是否为写操作（INSERT/UPDATE/DELETE/DDL）
6. 如果是写操作且表不在白名单中 → 返回友好错误和 SQL
7. 如果是写操作且表在白名单中 → 使用显式事务执行 `executeWriteQuery()`
8. 如果是读操作 → 设置 `TRANSACTION READ ONLY`，执行查询，回滚
9. 返回带有执行时间的格式化结果

## 贡献

欢迎贡献！请：
1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m 'Add some amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 开启 Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 致谢

- 原作者 [@benborla29](https://github.com/benborla) 创建了 mcp-server-mysql
- [Model Context Protocol](https://modelcontextprotocol.io/) 团队
- 所有贡献者

---

**英文文档：** 请参阅 [README.md](README.md) 获取英文版本。
