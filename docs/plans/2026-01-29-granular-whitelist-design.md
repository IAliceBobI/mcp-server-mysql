# 细粒度白名单权限系统设计

**日期**: 2026-01-29
**状态**: 已批准

## 概述

将单一的 `TABLE_WRITE_WHITELIST` 升级为 7 个独立的操作类型白名单，实现更精细的权限控制。

## 设计目标

1. **细粒度控制**: 每种操作类型有独立的白名单
2. **安全优先**: 空白名单 = 拒绝所有，危险模式（`*`）被禁止
3. **配置简化**: 只支持 MCP 配置文件中的数组格式
4. **清晰反馈**: 错误信息明确指出哪种操作被拒绝

## 架构设计

### 1. 配置结构

**7 个独立的白名单**:

- `TABLE_INSERT_WHITELIST` - INSERT 操作
- `TABLE_UPDATE_WHITELIST` - UPDATE 操作
- `TABLE_DELETE_WHITELIST` - DELETE 操作
- `TABLE_DDL_CREATE_WHITELIST` - CREATE TABLE 操作
- `TABLE_DDL_ALTER_WHITELIST` - ALTER TABLE 操作
- `TABLE_DDL_DROP_WHITELIST` - DROP TABLE 操作
- `TABLE_DDL_TRUNCATE_WHITELIST` - TRUNCATE TABLE 操作

**配置格式示例** (.mcp.json):

```json
{
  "env": {
    "TABLE_INSERT_WHITELIST": ["mcp_test.*", "production.users"],
    "TABLE_UPDATE_WHITELIST": ["mcp_test.*"],
    "TABLE_DELETE_WHITELIST": ["mcp_test.*"],
    "TABLE_DDL_CREATE_WHITELIST": ["mcp_test.*"],
    "TABLE_DDL_ALTER_WHITELIST": ["mcp_test.abc*"],
    "TABLE_DDL_DROP_WHITELIST": [],
    "TABLE_DDL_TRUNCATE_WHITELIST": ["mcp_test.abc*"]
  }
}
```

### 2. 安全验证

**白名单模式验证规则**:

1. **空字符串拒绝**: `[""]` → 过滤掉，记录警告日志
2. **危险模式拒绝**: `["*"]` → 拒绝，记录错误（会匹配所有表）
3. **无效格式拒绝**: `["..*"]` → 必须包含至少一个非通配符字符
4. **有效通配符**: `["db.*"]`, `["*.table"]`, `["db.test_*"]` ✅

**验证函数**:

```typescript
function validateWhitelistPattern(pattern: string): boolean {
  const trimmed = pattern.trim();

  if (!trimmed) {
    log("warn", `Empty whitelist pattern detected, skipping`);
    return false;
  }

  if (trimmed === "*") {
    log("error", `Dangerous whitelist pattern "*" detected - would match all tables`);
    return false;
  }

  const hasNonWildcard = /[^\*\.]/.test(trimmed);
  if (!hasNonWildcard) {
    log("error", `Invalid whitelist pattern "${trimmed}"`);
    return false;
  }

  return true;
}
```

### 3. 配置解析

**只支持数组格式**:

```typescript
function parseWhitelistEnv(envValue: any): string[] {
  if (!envValue) return [];

  if (!Array.isArray(envValue)) {
    log("error", `Whitelist configuration must be an array`);
    return [];
  }

  return envValue
    .map(p => String(p).trim())
    .filter(validateWhitelistPattern);
}
```

- ✅ MCP 配置文件: 数组格式
- ❌ 环境变量: 不支持，返回空数组并记录错误

### 4. 权限检查

**统一权限检查接口**:

```typescript
function checkTablePermission(table: string, operation: string): boolean {
  const whitelist = getWhitelistForOperation(operation);
  return whitelist.some(pattern => matchWildcard(table, pattern));
}

function getWhitelistForOperation(operation: string): string[] {
  switch (operation) {
    case 'insert': return TABLE_INSERT_WHITELIST;
    case 'update': return TABLE_UPDATE_WHITELIST;
    case 'delete': return TABLE_DELETE_WHITELIST;
    case 'create': return TABLE_DDL_CREATE_WHITELIST;
    case 'alter': return TABLE_DDL_ALTER_WHITELIST;
    case 'drop': return TABLE_DDL_DROP_WHITELIST;
    case 'truncate': return TABLE_DDL_TRUNCATE_WHITELIST;
    default: return [];
  }
}
```

### 5. 错误处理

**增强的错误信息**:

```typescript
// 旧格式
"Write operation not allowed for table 'mcp_test.users'"

// 新格式
"INSERT operation not allowed for table 'mcp_test.users'.
Table is not in TABLE_INSERT_WHITELIST.
SQL: INSERT INTO mcp_test.users ..."
```

## 实施计划

### 阶段 1: 配置和验证
- [ ] 添加 7 个新的白名单常量到 `src/config/index.ts`
- [ ] 实现 `validateWhitelistPattern()` 验证函数
- [ ] 实现 `parseWhitelistEnv()` 解析函数
- [ ] 移除 `TABLE_WRITE_WHITELIST` 及其引用

### 阶段 2: 权限检查
- [ ] 重构 `src/db/permissions.ts`
- [ ] 实现 `checkTablePermission()` 统一接口
- [ ] 更新 `matchWildcard()` 文档和注释

### 阶段 3: 查询执行
- [ ] 修改 `src/db/index.ts` 中的 `executeReadOnlyQuery()`
- [ ] 集成 `checkTablePermission()` 到权限检查流程
- [ ] 更新错误信息格式

### 阶段 4: 测试
- [ ] 添加 `whitelistValidation.test.ts` 单元测试
- [ ] 添加 `granular-whitelist.test.ts` 集成测试
- [ ] 更新现有测试用例以使用新配置
- [ ] 测试安全验证（空字符串、`*` 模式等）

### 阶段 5: 文档
- [ ] 更新 README.md 环境变量部分
- [ ] 更新 CLAUDE.md 权限系统部分
- [ ] 添加配置示例到文档

## 破坏性变更

- ✅ **移除**: `TABLE_WRITE_WHITELIST` 环境变量
- ✅ **变更**: 白名单必须通过 MCP 配置文件设置
- ✅ **变更**: 配置格式必须是数组（不支持逗号分隔字符串）

## 测试策略

### 单元测试

**whitelistValidation.test.ts**:
- 空字符串过滤
- 危险模式 `*` 被拒绝
- 有效通配符模式
- 数组格式解析

**permissions.test.ts**:
- 每个操作类型的独立白名单检查
- 通配符匹配边界情况

### 集成测试

**granular-whitelist.test.ts**:
- INSERT/UPDATE/DELETE 操作权限
- DDL 操作权限（CREATE/ALTER/DROP/TRUNCATE）
- 被拒绝操作的错误信息
- 跨数据库操作

## 安全考虑

1. **默认拒绝**: 空白名单 = 完全禁止该操作类型
2. **危险模式检测**: 自动拒绝 `*` 模式
3. **格式验证**: 强制使用数组格式，避免配置错误
4. **清晰日志**: 验证失败时记录详细日志

## 向后兼容性

无。这是破坏性变更，用户需要：
1. 更新 `.mcp.json` 配置文件
2. 使用新的 7 个白名单变量
3. 使用数组格式配置
