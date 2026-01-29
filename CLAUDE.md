# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides MySQL database access to LLMs like Claude, with enhanced write operation support and Claude Code optimizations.

**Key Technologies:**

- TypeScript with ES Modules (NodeNext)
- MCP SDK (@modelcontextprotocol/sdk v1.15.1)
- mysql2 for database connectivity
- Vitest for testing
- Express for remote MCP mode (optional)

## Build and Development Commands

### Building

```bash
# Build TypeScript to dist/
pnpm build

# Watch mode (auto-rebuild on changes)
pnpm watch
```

### Running

```bash
# Run built version
pnpm start

# Development mode with ts-node
pnpm dev

# Run directly with environment variables
pnpm exec
```

### Testing

```bash
# Setup test database (creates mcp_test DB and seeds data)
pnpm run setup:test:db

# Run all tests (includes pretest hook that runs setup:test:db)
pnpm test

# Run specific test suites
pnpm test:unit          # Unit tests only
pnpm test:integration   # Integration tests only
pnpm test:e2e          # End-to-end tests only
pnpm test:socket       # Socket connection tests

# Watch mode for development
pnpm test:watch

# Coverage report
pnpm test:coverage
```

**Test Environment Requirements:**

- MySQL server running locally or remotely
- Test database user: `mcp_test` with password `mcp_test_password`
- Test database: `mcp_test`
- Configuration via `.env.test` file

### Linting

```bash
pnpm lint
```

## Architecture

### Core Entry Point

- `index.ts` - Main server file that exports `createMcpServer()` function
  - Supports both stdio and HTTP transport modes
  - Handles MCP protocol setup and request routing
  - Configures shutdown handlers for graceful cleanup

### Key Modules

**Configuration (`src/config/index.ts`)**

- Loads environment variables via dotenv
- Exports connection config, permission flags, and mode detection
- Key exports:
  - `mcpConfig` - MySQL connection configuration
  - `isMultiDbMode` - Boolean indicating multi-database mode
  - `ALLOW_*_OPERATION` - Global write permission flags
  - `SCHEMA_*_PERMISSIONS` - Schema-specific permission maps
  - `MYSQL_DISABLE_READ_ONLY_TRANSACTIONS` - Control transaction mode

**Database Layer (`src/db/index.ts`)**

- Connection pooling via `getPool()` and lazy-loaded `poolPromise`
- Three query execution methods:
  - `executeQuery<T>()` - Basic query execution
  - `executeReadOnlyQuery<T>()` - Enforces read-only transaction mode (unless disabled)
  - `executeWriteQuery<T>()` - Handles INSERT/UPDATE/DELETE/DDL with transactions
- Permission checking integrated into query execution
- Schema extraction from queries for permission enforcement

**Permissions (`src/db/permissions.ts`)**

- Schema-specific permission checking functions:
  - `isInsertAllowedForSchema(schema)`
  - `isUpdateAllowedForSchema(schema)`
  - `isDeleteAllowedForSchema(schema)`
  - `isDDLAllowedForSchema(schema)`
- Falls back to global permissions if no schema-specific rule exists

**SQL Parsing (`src/db/utils.ts`)**

- `getQueryTypes()` - Parses SQL using `node-sql-parser` to identify operation types
- `extractSchemaFromQuery()` - Extracts database schema from qualified table names or `USE` statements

**General Utilities (`src/utils/index.ts`)**

- `log()` - Conditional logging based on `ENABLE_LOGGING` environment variable
- `parseSchemaPermissions()` - Parses schema permission strings (`db1:true,db2:false`)
- `parseMySQLConnectionString()` - Parses MySQL CLI-format connection strings (e.g., `mysql -hHOST -uUSER -pPASS db`)

**Types (`src/types/index.ts`)**

- `SchemaPermissions` - Record mapping schema names to boolean permissions
- `TableRow` - Table metadata from information_schema
- `ColumnRow` - Column metadata for resources

### MCP Protocol Implementation

**Resources** (Database introspection):

- `ListResourcesRequest` - Returns all tables across accessible schemas
- `ReadResourceRequest` - Returns column metadata for specific tables
- URIs: `mysql://tables` and `mysql://tables/{tableName}`

**Tools** (Query execution):

- `mysql_query` - Single tool that executes SQL queries
- Input: `{ sql: string }`
- Output: JSON result set with execution time
- Permission enforcement happens in `executeReadOnlyQuery` before query execution
- Read queries use `SET SESSION TRANSACTION READ ONLY` unless disabled
- Write queries (INSERT/UPDATE/DELETE/DDL) use explicit transactions with commit/rollback

### Multi-Database Mode

When `MYSQL_DB` environment variable is empty or unset:

- Server operates in multi-DB mode
- Queries must use fully qualified table names (`database.table`) or `USE` statements
- Schema-specific permissions apply per database
- Write operations disabled by default unless `MULTI_DB_WRITE_MODE=true`

### Permission System

**Two-Level Hierarchy:**

1. Global flags: `ALLOW_INSERT_OPERATION`, `ALLOW_UPDATE_OPERATION`, `ALLOW_DELETE_OPERATION`, `ALLOW_DDL_OPERATION`
2. Schema-specific overrides: `SCHEMA_*_PERMISSIONS` environment variables

**Format:** `SCHEMA_INSERT_PERMISSIONS=development:true,test:true,production:false`

**Transaction Safety:**

- Read operations use `SET SESSION TRANSACTION READ ONLY` by default
- Can be disabled with `MYSQL_DISABLE_READ_ONLY_TRANSACTIONS=true` for DDL support
- Write operations use explicit transactions with commit/rollback

### Remote MCP Mode

When `IS_REMOTE_MCP=true` and `REMOTE_SECRET_KEY` is set:

- Starts Express HTTP server on `PORT` (default 3000)
- Accepts POST requests to `/mcp` endpoint
- Requires `Authorization: Bearer <REMOTE_SECRET_KEY>` header
- Uses StreamableHTTPServerTransport instead of stdio
- Stateless mode: creates new server/transport instance per request

### Query Execution Flow

1. Tool call received → `CallToolRequestSchema` handler in `index.ts:284`
2. Calls `executeReadOnlyQuery(sql)` in `src/db/index.ts:176`
3. Parse query type via `getQueryTypes()` using `node-sql-parser`
4. Extract schema via `extractSchemaFromQuery()` for permission checking
5. Check permissions (`isInsertAllowedForSchema`, etc.) in `src/db/permissions.ts`
6. If write allowed → `executeWriteQuery()` with explicit transaction
7. If read-only → Set `TRANSACTION READ ONLY`, execute query, rollback
8. Return formatted result with execution time

## Project Structure

```markdown
.
├── index.ts                    # Main entry point
├── src/
│   ├── config/index.ts        # Configuration and env loading
│   ├── db/
│   │   ├── index.ts           # Database connection and query execution
│   │   ├── permissions.ts     # Schema permission checks
│   │   └── utils.ts           # SQL parsing utilities
│   ├── types/index.ts         # TypeScript type definitions
│   └── utils/index.ts         # General utilities (logging, etc.)
├── scripts/
│   └── setup-test-db.ts       # Test database setup script
├── tests/
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests (MySQL required)
│   └── e2e/                   # End-to-end server tests
├── evals.ts                   # MCP evaluation scripts
└── dist/                      # Compiled JavaScript output
```

## Important Architecture Notes

### Connection Methods

The server supports three MySQL connection methods:

1. **TCP/IP**: Set `MYSQL_HOST` and `MYSQL_PORT`
2. **Unix Socket**: Set `MYSQL_SOCKET_PATH` (takes precedence over TCP/IP)
3. **Connection String**: Set `MYSQL_CONNECTION_STRING` with MySQL CLI format (e.g., `mysql -hHOST -P3306 -uUSER -pPASS database_name`)
   - Takes precedence over individual connection variables
   - Useful for rotating credentials or temporary connections

### Testing Strategy

- Tests require a real MySQL instance
- `setup:test:db` script must run before tests to create schema and seed data
- Use `.env.test` for test-specific configuration
- Integration tests cover multi-DB mode, schema permissions, and socket connections

### ES Module Quirks

- Uses `"type": "module"` in package.json
- All imports must include `.js` extension (TypeScript quirk for ES modules)
- `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`

### Error Handling

- `safeExit()` function prevents process.exit during tests
- All database operations use try/catch with proper connection release
- Query errors include execution context and schema information

### Performance Considerations

- Connection pooling with configurable limit (default 10)
- Query execution timing tracked via `performance.now()`
- Lazy pool initialization on first query
- Configurable connection timeout, queue limit, and SSL/TLS support

## Permission Control Granularity

**Current Implementation:**

- **Global Level**: `ALLOW_INSERT_OPERATION`, `ALLOW_UPDATE_OPERATION`, etc.
- **Schema (Database) Level**: `SCHEMA_INSERT_PERMISSIONS`, `SCHEMA_UPDATE_PERMISSIONS`, etc.
  - Format: `SCHEMA_INSERT_PERMISSIONS=development:true,test:true,production:false`

**Table-level permissions are NOT supported**. Permission checking in `src/db/permissions.ts` only accepts `schema` parameter, not table names.

## Common Development Tasks

### Running a Single Test Suite

```bash
# Unit tests only (no MySQL required)
pnpm test:unit

# Integration tests (MySQL required)
pnpm test:integration

# E2e tests (MySQL required)
pnpm test:e2e

# Socket connection tests
pnpm test:socket
```

### Adding New Query Types

1. Update SQL parser logic in `src/db/utils.ts` (`getQueryTypes`)
2. Add permission checking in `src/db/index.ts` (`executeReadOnlyQuery`)
3. Handle result formatting in `executeWriteQuery` if needed
4. Add integration tests in `tests/integration/`

### Adding Environment Variables

1. Add to `.env` example in README
2. Parse in `src/config/index.ts`
3. Export for use in other modules
4. Document in README's Environment Variables section

### Modifying Permission Logic

1. Update permission functions in `src/db/permissions.ts`
2. Modify schema extraction if needed in `src/db/utils.ts`
3. Test with schema-specific permission scenarios
4. Update permission checking in `executeReadOnlyQuery`
