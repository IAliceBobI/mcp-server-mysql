import * as dotenv from "dotenv";
import { parseMySQLConnectionString } from "../utils/index.js";

export const MCP_VERSION = "2.0.2";

// @INFO: Load environment variables from .env file
// Use .env.test when NODE_ENV=test
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test" });
} else {
  dotenv.config();
}

// @INFO: Parse connection string if provided
// Connection string takes precedence over individual environment variables
const connectionStringConfig = process.env.MYSQL_CONNECTION_STRING
  ? parseMySQLConnectionString(process.env.MYSQL_CONNECTION_STRING)
  : {};

// @INFO: Update the environment setup to ensure database is correctly set
if (process.env.NODE_ENV === "test" && !process.env.MYSQL_DB) {
  process.env.MYSQL_DB = "mcp_test_db"; // @INFO: Ensure we have a database name for tests
}

// ============================================================================
// GRANULAR WHITELIST PERMISSION SYSTEM
// ============================================================================

/**
 * Validate a whitelist pattern for security and correctness
 * @param pattern - The whitelist pattern to validate
 * @returns true if pattern is valid, false otherwise
 */
function validateWhitelistPattern(pattern: string): boolean {
  const trimmed = pattern.trim();

  // Reject empty strings
  if (!trimmed) {
    console.warn(`[Whitelist] Empty pattern detected, skipping`);
    return false;
  }

  // Reject dangerous wildcard that matches all tables
  if (trimmed === "*") {
    console.error(`[Whitelist] Dangerous pattern "*" detected - would match all tables. Use explicit patterns like "db.*" or "*.table"`);
    return false;
  }

  // Ensure pattern contains at least one non-wildcard, non-dot character
  const hasNonWildcard = /[^\*\.]/.test(trimmed);
  if (!hasNonWildcard) {
    console.error(`[Whitelist] Invalid pattern "${trimmed}" - must contain at least one concrete character`);
    return false;
  }

  return true;
}

/**
 * Parse whitelist environment variable
 * Supports comma-separated format: "db.table,*.logs,production.*"
 * @param envValue - Environment variable value
 * @returns Array of validated whitelist patterns
 */
function parseWhitelistEnv(envValue: any): string[] {
  if (!envValue) {
    return [];
  }

  let patterns: string[];

  // Handle array format (MCP configuration)
  if (Array.isArray(envValue)) {
    patterns = envValue;
  }
  // Handle comma-separated string format
  else if (typeof envValue === 'string') {
    const trimmed = envValue.trim();
    patterns = trimmed.split(',').map(p => p.trim()).filter(p => p);
  }
  // Invalid format
  else {
    console.error(`[Whitelist] Configuration must be an array or CSV string. Got: ${typeof envValue}`);
    return [];
  }

  // Validate each pattern
  return patterns
    .map((p) => String(p).trim())
    .filter(validateWhitelistPattern);
}

// ============================================================================
// OPERATION-SPECIFIC WHITELISTS
// ============================================================================
// Each whitelist controls access for a specific SQL operation type.
// Empty array = all operations of that type are denied (security-first default).
// All whitelists support wildcard patterns: "db.*", "*.table", "db.test_*"

// DML (Data Manipulation Language) Operations
export const TABLE_SELECT_WHITELIST: string[] = []; // SELECT is always allowed, no whitelist needed
export const TABLE_INSERT_WHITELIST = parseWhitelistEnv(process.env.TABLE_INSERT_WHITELIST);
export const TABLE_UPDATE_WHITELIST = parseWhitelistEnv(process.env.TABLE_UPDATE_WHITELIST);
export const TABLE_DELETE_WHITELIST = parseWhitelistEnv(process.env.TABLE_DELETE_WHITELIST);

// DDL (Data Definition Language) Operations
// CREATE TABLE is allowed without whitelist restriction
export const TABLE_DDL_ALTER_WHITELIST = parseWhitelistEnv(process.env.TABLE_DDL_ALTER_WHITELIST);
export const TABLE_DDL_DROP_WHITELIST = parseWhitelistEnv(process.env.TABLE_DDL_DROP_WHITELIST);
export const TABLE_DDL_TRUNCATE_WHITELIST = parseWhitelistEnv(process.env.TABLE_DDL_TRUNCATE_WHITELIST);

// Transaction mode control
export const MYSQL_DISABLE_READ_ONLY_TRANSACTIONS =
  process.env.MYSQL_DISABLE_READ_ONLY_TRANSACTIONS === "true";

// Remote MCP configuration
export const IS_REMOTE_MCP = process.env.IS_REMOTE_MCP === "true";
export const REMOTE_SECRET_KEY = process.env.REMOTE_SECRET_KEY || "";
export const PORT = process.env.PORT || 3000;

// Check if we're in multi-DB mode (no specific DB set)
const dbFromEnvOrConnString = connectionStringConfig.database || process.env.MYSQL_DB;
export const isMultiDbMode =
  !dbFromEnvOrConnString || dbFromEnvOrConnString.trim() === "";

export const mcpConfig = {
  server: {
    name: "@benborla29/mcp-server-mysql",
    version: MCP_VERSION,
    connectionTypes: ["stdio", "streamableHttp"],
  },
  mysql: {
    // Use Unix socket if provided (connection string takes precedence), otherwise use host/port
    ...(connectionStringConfig.socketPath || process.env.MYSQL_SOCKET_PATH
      ? {
          socketPath: connectionStringConfig.socketPath || process.env.MYSQL_SOCKET_PATH,
        }
      : {
          host: connectionStringConfig.host || process.env.MYSQL_HOST || "127.0.0.1",
          port: connectionStringConfig.port || Number(process.env.MYSQL_PORT || "3306"),
        }),
    user: connectionStringConfig.user || process.env.MYSQL_USER || "root",
    ...(connectionStringConfig.password !== undefined || (process.env.MYSQL_PASS && process.env.MYSQL_PASS.length > 0)
      ? {
          password: connectionStringConfig.password !== undefined
            ? connectionStringConfig.password
            : process.env.MYSQL_PASS,
        }
      : {}),
    database: connectionStringConfig.database || process.env.MYSQL_DB || undefined, // Allow undefined database for multi-DB mode
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: process.env.MYSQL_QUEUE_LIMIT ? parseInt(process.env.MYSQL_QUEUE_LIMIT, 10) : 100,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: process.env.MYSQL_CONNECT_TIMEOUT ? parseInt(process.env.MYSQL_CONNECT_TIMEOUT, 10) : 10000,
    ...(connectionStringConfig.password !== undefined || (process.env.MYSQL_PASS && process.env.MYSQL_PASS.length > 0)
      ? {
          authPlugins: {
            mysql_clear_password: () => () =>
              Buffer.from(
                connectionStringConfig.password !== undefined
                  ? connectionStringConfig.password
                  : process.env.MYSQL_PASS || ""
              ),
          },
        }
      : {}),
    ...(process.env.MYSQL_SSL === "true"
      ? {
          ssl: {
            rejectUnauthorized:
              process.env.MYSQL_SSL_REJECT_UNAUTHORIZED === "true",
          },
        }
      : {}),
    // Timezone configuration for date/time handling
    ...(process.env.MYSQL_TIMEZONE
      ? {
          timezone: process.env.MYSQL_TIMEZONE,
        }
      : {}),
    // Return date values as strings instead of JavaScript Date objects
    ...(process.env.MYSQL_DATE_STRINGS === "true"
      ? {
          dateStrings: true,
        }
      : {}),
  },
  paths: {
    schema: "schema",
  },
};
