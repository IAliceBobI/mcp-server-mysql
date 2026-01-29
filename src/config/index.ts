import * as dotenv from "dotenv";
import { parseMySQLConnectionString } from "../utils/index.js";

export const MCP_VERSION = "2.0.2";

// @INFO: Load environment variables from .env file
dotenv.config();

// @INFO: Parse connection string if provided
// Connection string takes precedence over individual environment variables
const connectionStringConfig = process.env.MYSQL_CONNECTION_STRING
  ? parseMySQLConnectionString(process.env.MYSQL_CONNECTION_STRING)
  : {};

// @INFO: Update the environment setup to ensure database is correctly set
if (process.env.NODE_ENV === "test" && !process.env.MYSQL_DB) {
  process.env.MYSQL_DB = "mcp_test_db"; // @INFO: Ensure we have a database name for tests
}

// Table write whitelist configuration
// Supports comma-separated patterns with wildcards, e.g., "production.users,*.logs,dev.test_*"
// Empty or unset = all tables are read-only (security-first default)
const whitelistEnv = process.env.TABLE_WRITE_WHITELIST || "";
export const TABLE_WRITE_WHITELIST = whitelistEnv
  ? whitelistEnv.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

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
    password:
      connectionStringConfig.password !== undefined
        ? connectionStringConfig.password
        : process.env.MYSQL_PASS === undefined
          ? ""
          : process.env.MYSQL_PASS,
    database: connectionStringConfig.database || process.env.MYSQL_DB || undefined, // Allow undefined database for multi-DB mode
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: process.env.MYSQL_QUEUE_LIMIT ? parseInt(process.env.MYSQL_QUEUE_LIMIT, 10) : 100,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: process.env.MYSQL_CONNECT_TIMEOUT ? parseInt(process.env.MYSQL_CONNECT_TIMEOUT, 10) : 10000,
    authPlugins: {
      mysql_clear_password: () => () =>
        Buffer.from(
          connectionStringConfig.password !== undefined
            ? connectionStringConfig.password
            : process.env.MYSQL_PASS !== undefined
              ? process.env.MYSQL_PASS
              : ""
        ),
    },
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
