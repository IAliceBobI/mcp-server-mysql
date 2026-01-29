# Table Whitelist Permissions Design

**Date:** 2026-01-29
**Status:** Approved
**Author:** Claude Code

## Overview

Simplify the existing three-tier permission system (global → schema → table) into a **single whitelist mode**. Core principle: **security-first** - all tables are read-only by default, only explicitly whitelisted tables can execute write operations.

## Configuration

### Environment Variable

```bash
# Single permission configuration needed
TABLE_WRITE_WHITELIST=production.users,*.logs,dev.test_*

# Configuration examples
TABLE_WRITE_WHITELIST=production.users,production.orders,*.logs,dev.temp_*
```

### Wildcard Matching Rules

Supports simple `*` wildcard matching zero or more arbitrary characters:

| Pattern | Matches | Does Not Match |
|---------|---------|----------------|
| `production.users` | `production.users` | `dev.users` |
| `*.logs` | `dev.logs`, `prod.logs` | `dev.log_table` |
| `production.*` | `production.users`, `production.orders` | `dev.users` |
| `dev.test_*` | `dev.test_1`, `dev.test_temp` | `dev.prod_1` |
| `*.*` | All tables | None |

### Default Behavior

```bash
# Not set or empty
TABLE_WRITE_WHITELIST=
→ All tables are read-only (security first)

# Global writable
TABLE_WRITE_WHITELIST=*.*
→ All tables writable
```

## Permission Logic

**Whitelisted tables:**

- ✅ SELECT (read)
- ✅ INSERT (write)
- ✅ UPDATE (write)
- ✅ DELETE (write)
- ✅ DDL (CREATE, ALTER, DROP, TRUNCATE)

**Non-whitelisted tables:**

- ✅ SELECT (read)
- ❌ INSERT (write)
- ❌ UPDATE (write)
- ❌ DELETE (write)
- ❌ DDL (CREATE, ALTER, DROP, TRUNCATE)

## Removed Configurations

The following environment variables will be **removed** as they are no longer needed:

- `ALLOW_INSERT_OPERATION`
- `ALLOW_UPDATE_OPERATION`
- `ALLOW_DELETE_OPERATION`
- `ALLOW_DDL_OPERATION`
- `SCHEMA_INSERT_PERMISSIONS`
- `SCHEMA_UPDATE_PERMISSIONS`
- `SCHEMA_DELETE_PERMISSIONS`
- `SCHEMA_DDL_PERMISSIONS`

## Error Handling

### Write Denied Response Format

When AI attempts to execute write operations on non-whitelisted tables:

```typescript
{
  content: [
    {
      type: "text",
      text: `❌ Error: Write operation not allowed

Table: 'production.payments' is not in the write whitelist.

🔒 This table is read-only. Only tables in TABLE_WRITE_WHITELIST can be modified.

📝 SQL Query:
${sql}

💡 To execute this operation:
1. Ask your administrator to add this table to TABLE_WRITE_WHITELIST
2. Or execute the SQL manually in your database client`
    }
  ],
  isError: true
}
```

## Implementation

### 1. Table Name Extraction (`src/db/utils.ts`)

```typescript
// New: Extract full table name from SQL
function extractTableFromQuery(sql: string): string | null {
  try {
    const ast = parser.astify(sql, { database: "mysql" });
    const statements = Array.isArray(ast) ? ast : [ast];
    const firstStmt = statements[0];

    const tableRef = firstStmt?.table?.[0] || firstStmt?.from?.[0];
    if (tableRef) {
      const db = tableRef.db || process.env.MYSQL_DB || "default";
      return `${db}.${tableRef.table}`;
    }
  } catch (err) {
    log("error", "Failed to extract table from SQL:", err);
  }
  return null;
}
```

### 2. Whitelist Matching (`src/db/permissions.ts`)

```typescript
// Refactor: Remove all schema permission functions, keep only whitelist check
function isTableInWriteWhitelist(tableFullName: string): boolean {
  if (!TABLE_WRITE_WHITELIST || TABLE_WRITE_WHITELIST.length === 0) {
    return false; // Default read-only
  }

  return TABLE_WRITE_WHITELIST.some(pattern =>
    matchWildcard(tableFullName, pattern)
  );
}

function matchWildcard(table: string, pattern: string): boolean {
  // *.logs → /^.*\.logs$/
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  return new RegExp(`^${regex}$`).test(table);
}
```

### 3. Configuration Parsing (`src/config/index.ts`)

```typescript
// Remove: ALLOW_*_OPERATION (4 vars)
// Remove: SCHEMA_*_PERMISSIONS (4 vars)

// Add: Whitelist configuration
const whitelistEnv = process.env.TABLE_WRITE_WHITELIST || "";
export const TABLE_WRITE_WHITELIST = whitelistEnv
  ? whitelistEnv.split(",").map(s => s.trim()).filter(Boolean)
  : [];
```

### 4. Permission Check Flow (`src/db/index.ts`)

```typescript
async function executeReadOnlyQuery<T>(sql: string): Promise<T> {
  // 1. Parse query type
  const queryTypes = await getQueryTypes(sql);

  // 2. Extract table name
  const table = extractTableFromQuery(sql);

  // 3. Check if write operation
  const isWriteOperation = queryTypes.some(type =>
    ['insert', 'update', 'delete', 'create', 'alter', 'drop', 'truncate'].includes(type)
  );

  // 4. Write operation not in whitelist → deny
  if (isWriteOperation && table && !isTableInWriteWhitelist(table)) {
    return {
      content: [{
        type: "text",
        text: formatWriteDeniedError(table, sql)
      }],
      isError: true
    } as T;
  }

  // 5. Whitelisted write operation → execute
  if (isWriteOperation && isTableInWriteWhitelist(table)) {
    return executeWriteQuery(sql);
  }

  // 6. Read operation → normal execution
  // ... existing read-only transaction logic
}
```

## Testing

### Unit Tests

```typescript
// src/db/__tests__/whitelist.test.ts

describe('Table Whitelist', () => {
  describe('Wildcard Matching', () => {
    test('*.logs matches dev.logs and prod.logs', () => {
      expect(matchWildcard('dev.logs', '*.logs')).toBe(true);
      expect(matchWildcard('prod.logs', '*.logs')).toBe(true);
    });

    test('production.* matches all tables in that database', () => {
      expect(matchWildcard('production.users', 'production.*')).toBe(true);
      expect(matchWildcard('production.orders', 'production.*')).toBe(true);
      expect(matchWildcard('dev.users', 'production.*')).toBe(false);
    });
  });

  describe('Permission Checks', () => {
    test('Whitelisted table allows write operations', () => {
      process.env.TABLE_WRITE_WHITELIST = 'production.users';
      expect(isTableInWriteWhitelist('production.users')).toBe(true);
    });

    test('Non-whitelisted table denies write operations', () => {
      process.env.TABLE_WRITE_WHITELIST = 'production.users';
      expect(isTableInWriteWhitelist('production.orders')).toBe(false);
    });

    test('Empty whitelist defaults to read-only', () => {
      process.env.TABLE_WRITE_WHITELIST = '';
      expect(isTableInWriteWhitelist('any.table')).toBe(false);
    });
  });
});
```

### Integration Tests

```typescript
describe('Whitelist Integration', () => {
  test('SELECT queries not restricted by whitelist', async () => {
    const result = await executeReadOnlyQuery('SELECT * FROM production.orders');
    expect(result.isError).toBe(false);
  });

  test('INSERT whitelisted table succeeds', async () => {
    process.env.TABLE_WRITE_WHITELIST = 'production.users';
    const result = await executeReadOnlyQuery('INSERT INTO production.users ...');
    expect(result.isError).toBe(false);
  });

  test('INSERT non-whitelisted table returns friendly error', async () => {
    process.env.TABLE_WRITE_WHITELIST = 'production.users';
    const result = await executeReadOnlyQuery('INSERT INTO production.orders ...');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('write whitelist');
  });
});
```

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Table name extraction fails | Default deny write operations, log warning |
| Multi-statement queries | Check all involved tables, deny if any not in whitelist |
| Queries without table name (e.g., SELECT 1) | Allow execution |
| Invalid wildcard pattern syntax | Validate and error on startup, don't start service |
| Temporary tables, subqueries | Extract table name from main query's FROM/INSERT INTO clause |

## Migration Guide

### Environment Variable Migration

| Old Configuration (Remove) | New Configuration | Migration Example |
|----------------------------|-------------------|-------------------|
| `ALLOW_INSERT_OPERATION=true` | Remove | - |
| `ALLOW_UPDATE_OPERATION=true` | Remove | - |
| `ALLOW_DELETE_OPERATION=true` | Remove | - |
| `ALLOW_DDL_OPERATION=true` | Remove | - |
| `SCHEMA_INSERT_PERMISSIONS=dev:true,prod:false` | `TABLE_WRITE_WHITELIST=dev.*` | Schema → Table level |
| `SCHEMA_UPDATE_PERMISSIONS=dev:true,prod:false` | `TABLE_WRITE_WHITELIST=dev.*` | Same |
| `SCHEMA_DELETE_PERMISSIONS=prod:true` | `TABLE_WRITE_WHITELIST=production.*` | Same |
| `SCHEMA_DDL_PERMISSIONS=dev:true` | `TABLE_WRITE_WHITELIST=dev.*` | Same |

### Migration Example

**Old configuration (complex):**

```bash
ALLOW_INSERT_OPERATION=true
ALLOW_UPDATE_OPERATION=true
ALLOW_DELETE_OPERATION=false
SCHEMA_INSERT_PERMISSIONS=development:true,testing:true
SCHEMA_UPDATE_PERMISSIONS=development:true
SCHEMA_DELETE_PERMISSIONS=testing:true
```

**New configuration (simplified):**

```bash
# One line to rule them all
TABLE_WRITE_WHITELIST=development.*,testing.*
```

## Documentation Updates

### README.md

```markdown
## Permission System (White List Mode)

**Simplified to single whitelist configuration:**

```bash
# Write operations only allowed for whitelisted tables
TABLE_WRITE_WHITELIST=production.users,*.logs,dev.test_*

# Empty or unset = all tables are read-only (safe by default)
TABLE_WRITE_WHITELIST=

# All tables writable
TABLE_WRITE_WHITELIST=*.*
```

**Wildcard patterns:**

- `*.logs` → Matches any database's `logs` table
- `production.*` → Matches all tables in `production` database
- `dev.test_*` → Matches tables starting with `test_` in `dev` database

**Removed configurations:**

- `ALLOW_INSERT_OPERATION`, `ALLOW_UPDATE_OPERATION`, `ALLOW_DELETE_OPERATION`, `ALLOW_DDL_OPERATION`
- `SCHEMA_INSERT_PERMISSIONS`, `SCHEMA_UPDATE_PERMISSIONS`, `SCHEMA_DELETE_PERMISSIONS`, `SCHEMA_DDL_PERMISSIONS`

```text

### Changelog

```markdown
## Changelog

### [2.1.0] - 2025-01-XX
### Changed
- **BREAKING**: Simplified permission system to whitelist-only mode
- Removed global `ALLOW_*_OPERATION` flags
- Removed schema-level `SCHEMA_*_PERMISSIONS`
- Added `TABLE_WRITE_WHITELIST` with wildcard support
- Default behavior changed to read-only (safer by default)
```

## Files to Modify

1. **src/config/index.ts** - Add whitelist config, remove old permissions
2. **src/db/permissions.ts** - Simplify to single whitelist function
3. **src/db/utils.ts** - Add `extractTableFromQuery()` function
4. **src/db/index.ts** - Update permission check logic
5. **tests/unit/whitelist.test.ts** - Add new unit tests
6. **tests/integration/whitelist.test.ts** - Add integration tests
7. **README.md** - Update permission documentation
8. **CLAUDE.md** - Update architecture documentation
9. **CHANGELOG.md** - Add breaking change notice

## Benefits

1. **Simplicity**: One configuration instead of 8
2. **Security**: Default read-only, explicit whitelist for writes
3. **Clarity**: Clear wildcard patterns for table matching
4. **Maintainability**: Less code, less complexity
5. **User-friendly**: Clear error messages with SQL output
