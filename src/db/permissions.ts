import {
  TABLE_INSERT_WHITELIST,
  TABLE_UPDATE_WHITELIST,
  TABLE_DELETE_WHITELIST,
  TABLE_DDL_CREATE_WHITELIST,
  TABLE_DDL_ALTER_WHITELIST,
  TABLE_DDL_DROP_WHITELIST,
  TABLE_DDL_TRUNCATE_WHITELIST,
} from "../config/index.js";

/**
 * Get the whitelist for a specific operation type
 * @param operation - Operation type (insert, update, delete, create, alter, drop, truncate)
 * @returns Array of whitelist patterns for the operation
 */
function getWhitelistForOperation(operation: string): string[] {
  switch (operation) {
    case "insert":
      return TABLE_INSERT_WHITELIST;
    case "update":
      return TABLE_UPDATE_WHITELIST;
    case "delete":
      return TABLE_DELETE_WHITELIST;
    case "create":
      return TABLE_DDL_CREATE_WHITELIST;
    case "alter":
      return TABLE_DDL_ALTER_WHITELIST;
    case "drop":
      return TABLE_DDL_DROP_WHITELIST;
    case "truncate":
      return TABLE_DDL_TRUNCATE_WHITELIST;
    default:
      return [];
  }
}

/**
 * Check if a table has permission for a specific operation
 * @param tableFullName - Full table name with database prefix (e.g., "production.users")
 * @param operation - Operation type (insert, update, delete, create, alter, drop, truncate)
 * @returns true if operation is allowed, false if denied
 */
function checkTablePermission(tableFullName: string, operation: string): boolean {
  const whitelist = getWhitelistForOperation(operation);

  // Empty whitelist = all operations denied (security-first default)
  if (!whitelist || whitelist.length === 0) {
    return false;
  }

  return whitelist.some((pattern) => matchWildcard(tableFullName, pattern));
}

/**
 * Match table name against wildcard pattern
 * Supports simple * wildcard matching zero or more arbitrary characters
 *
 * @param table - Full table name (e.g., "production.users")
 * @param pattern - Wildcard pattern (e.g., "*.logs", "production.*", "dev.test_*")
 * @returns true if table matches pattern
 *
 * @examples
 * matchWildcard("production.users", "production.*") // true
 * matchWildcard("dev.logs", "*.logs")              // true
 * matchWildcard("dev.test_123", "dev.test_*")      // true
 * matchWildcard("prod.users", "dev.*")             // false
 */
function matchWildcard(table: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  // *.logs → /^.*\.logs$/
  // production.* → /^production\..*$/
  // dev.test_* → /^dev\.test_.*$/
  const regex = pattern
    .replace(/\./g, "\\.") // Escape literal dots
    .replace(/\*/g, ".*"); // Convert * to .*

  return new RegExp(`^${regex}$`).test(table);
}

export { checkTablePermission, getWhitelistForOperation, matchWildcard };
