import { TABLE_WRITE_WHITELIST } from "../config/index.js";

/**
 * Check if a table is in the write whitelist
 * @param tableFullName Full table name with database prefix (e.g., "production.users")
 * @returns true if table can be modified, false if read-only
 */
function isTableInWriteWhitelist(tableFullName: string): boolean {
  // Empty whitelist = all tables are read-only (security-first default)
  if (!TABLE_WRITE_WHITELIST || TABLE_WRITE_WHITELIST.length === 0) {
    return false;
  }

  return TABLE_WRITE_WHITELIST.some((pattern) =>
    matchWildcard(tableFullName, pattern)
  );
}

/**
 * Match table name against wildcard pattern
 * Supports simple * wildcard matching zero or more arbitrary characters
 * @param table Full table name (e.g., "production.users")
 * @param pattern Wildcard pattern (e.g., "*.logs", "production.*", "dev.test_*")
 * @returns true if table matches pattern
 */
function matchWildcard(table: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  // *.logs → /^.*\.logs$/
  // production.* → /^production\..*$/
  // dev.test_* → /^dev\.test_.*$/
  const regex = pattern
    .replace(/\./g, "\\.")  // Escape literal dots
    .replace(/\*/g, ".*");   // Convert * to .*

  return new RegExp(`^${regex}$`).test(table);
}

export { isTableInWriteWhitelist, matchWildcard };
