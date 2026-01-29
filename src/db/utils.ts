import { isMultiDbMode } from "./../config/index.js";
import { log } from "./../utils/index.js";
import SqlParser, { AST } from "node-sql-parser";

const { Parser } = SqlParser;
const parser = new Parser();

// Extract schema from SQL query
function extractSchemaFromQuery(sql: string): string | null {
  // Default schema from environment
  const defaultSchema = process.env.MYSQL_DB || null;

  // If we have a default schema and not in multi-DB mode, return it
  if (defaultSchema && !isMultiDbMode) {
    return defaultSchema;
  }

  // Try to extract schema from query

  // Case 1: USE database statement
  const useMatch = sql.match(/USE\s+`?([a-zA-Z0-9_]+)`?/i);
  if (useMatch && useMatch[1]) {
    return useMatch[1];
  }

  // Case 2: database.table notation
  const dbTableMatch = sql.match(/`?([a-zA-Z0-9_]+)`?\.`?[a-zA-Z0-9_]+`?/i);
  if (dbTableMatch && dbTableMatch[1]) {
    return dbTableMatch[1];
  }

  // Return default if we couldn't find a schema in the query
  return defaultSchema;
}

// Extract full table name (with database prefix) from SQL query
function extractTableFromQuery(sql: string): string | null {
  try {
    const ast = parser.astify(sql, { database: "mysql" }) as any;
    const statements = Array.isArray(ast) ? ast : [ast];
    const firstStmt = statements[0];

    // Try to get table reference from various AST locations
    // AST structure varies by query type (SELECT, INSERT, UPDATE, DELETE, etc.)
    let tableRef = firstStmt?.table?.[0] || firstStmt?.from?.[0];

    // For DROP, ALTER, TRUNCATE operations, table might be in 'name' field
    if (!tableRef && firstStmt?.name) {
      tableRef = firstStmt.name;
    }

    // Also check direct 'table' field for some DDL operations
    if (!tableRef && firstStmt?.table) {
      tableRef = firstStmt.table;
    }

    if (tableRef) {
      // Handle both object and array formats
      const tableObj = Array.isArray(tableRef) ? tableRef[0] : tableRef;
      const db = tableObj?.db || process.env.MYSQL_DB || "default";
      const tableName = tableObj?.table;
      if (tableName) {
        return `${db}.${tableName}`;
      }
    }
  } catch (err) {
    log("error", "Failed to extract table from SQL:", err);
  }
  return null;
}

// Format operation denied error message
function formatOperationDeniedError(
  operation: string,
  table: string,
  sql: string,
): string {
  const whitelistName = getWhitelistNameForOperation(operation);
  const operationDisplay = operation.toUpperCase();

  return `❌ Error: ${operationDisplay} operation not allowed

Table: '${table}' is not in the ${whitelistName} whitelist.

🔒 This table does not have ${operationDisplay} permissions. Only tables in ${whitelistName} can be modified with ${operationDisplay} operations.

📝 SQL Query:
${sql}

💡 To execute this operation:
1. Ask your administrator to add this table to ${whitelistName}
2. Or execute the SQL manually in your database client`;
}

/**
 * Get the whitelist environment variable name for an operation
 * @param operation - Operation type (insert, update, delete, create, alter, drop, truncate)
 * @returns Environment variable name (e.g., "TABLE_INSERT_WHITELIST")
 */
function getWhitelistNameForOperation(operation: string): string {
  const whitelistMap: Record<string, string> = {
    insert: "TABLE_INSERT_WHITELIST",
    update: "TABLE_UPDATE_WHITELIST",
    delete: "TABLE_DELETE_WHITELIST",
    alter: "TABLE_DDL_ALTER_WHITELIST",
    drop: "TABLE_DDL_DROP_WHITELIST",
    truncate: "TABLE_DDL_TRUNCATE_WHITELIST",
    // Note: CREATE TABLE has no whitelist restriction
  };

  return whitelistMap[operation] || "WHITELIST";
}

async function getQueryTypes(query: string): Promise<string[]> {
  try {
    log("info", "Parsing SQL query: ", query);
    // Parse into AST or array of ASTs - only specify the database type
    const astOrArray: AST | AST[] = parser.astify(query, { database: "mysql" });
    const statements = Array.isArray(astOrArray) ? astOrArray : [astOrArray];

    // Map each statement to its lowercased type (e.g., 'select', 'update', 'insert', 'delete', etc.)
    return statements.map((stmt) => stmt.type?.toLowerCase() ?? "unknown");
  } catch (err: any) {
    log("error", "sqlParser error, query: ", query);
    log("error", "Error parsing SQL query:", err);
    throw new Error(`Parsing failed: ${err.message}`);
  }
}

export { extractSchemaFromQuery, extractTableFromQuery, formatOperationDeniedError, getQueryTypes, getWhitelistNameForOperation };
