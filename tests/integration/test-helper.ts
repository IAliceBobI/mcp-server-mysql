import * as dotenv from "dotenv";
import * as path from "path";

/**
 * Update whitelist for testing
 * Note: This requires reloading modules, which is complex.
 * For now, tests should rely on the whitelist configured in .env.test
 */
export function setTestWhitelist(whitelist: string): void {
  process.env.TABLE_WRITE_WHITELIST = whitelist;
  // Note: This won't affect already loaded modules
  // For testing, we need to use different approach or restart the test process
}

/**
 * Get current whitelist value
 */
export function getTestWhitelist(): string {
  return process.env.TABLE_WRITE_WHITELIST || "";
}
