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

// Format write denied error message
function formatWriteDeniedError(table: string, sql: string): string {
  return `❌ Error: Write operation not allowed

Table: '${table}' is not in the write whitelist.

🔒 This table is read-only. Only tables in TABLE_WRITE_WHITELIST can be modified.

📝 SQL Query:
${sql}

💡 To execute this operation:
1. Ask your administrator to add this table to TABLE_WRITE_WHITELIST
2. Or execute the SQL manually in your database client`;
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

export { extractSchemaFromQuery, extractTableFromQuery, formatWriteDeniedError, getQueryTypes };
