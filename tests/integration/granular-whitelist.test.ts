// Load environment variables FIRST before any other imports
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

import * as mysql2 from "mysql2/promise";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { executeReadOnlyQuery } from "../../dist/src/db/index.js";

describe("Granular Whitelist Integration", () => {
  let pool: any;

  beforeAll(async () => {
    // Create a connection pool for testing
    const config: any = {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "root",
      database: process.env.MYSQL_DB || "mcp_test",
      connectionLimit: 5,
      multipleStatements: true,
    };

    if (process.env.MYSQL_PASS) {
      config.password = process.env.MYSQL_PASS;
    }

    pool = mysql2.createPool(config);

    // Create test tables
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS whitelist_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS whitelist_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          total DECIMAL(10, 2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS app_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          message TEXT,
          level VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tables NOT in INSERT/UPDATE/DELETE whitelists
      await connection.query(`
        CREATE TABLE IF NOT EXISTS restricted_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          data VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tables for testing CREATE TABLE permissions
      await connection.query(`
        CREATE TABLE IF NOT EXISTS temp_test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          data VARCHAR(255)
        )
      `);
    } finally {
      connection.release();
    }
  });

  afterAll(async () => {
    if (pool) {
      const connection = await pool.getConnection();
      try {
        await connection.query("DROP TABLE IF EXISTS whitelist_users");
        await connection.query("DROP TABLE IF EXISTS whitelist_orders");
        await connection.query("DROP TABLE IF EXISTS app_logs");
        await connection.query("DROP TABLE IF EXISTS restricted_table");
        await connection.query("DROP TABLE IF EXISTS temp_test_table");
      } finally {
        connection.release();
      }
      await pool.end();
    }
  });

  beforeEach(async () => {
    const connection = await pool.getConnection();
    try {
      // Ensure tables exist (in case they were dropped by previous tests)
      await connection.query(`
        CREATE TABLE IF NOT EXISTS whitelist_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await connection.query(`
        CREATE TABLE IF NOT EXISTS whitelist_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          total DECIMAL(10, 2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await connection.query(`
        CREATE TABLE IF NOT EXISTS app_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          message TEXT,
          level VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await connection.query(`
        CREATE TABLE IF NOT EXISTS restricted_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          data VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await connection.query(`
        CREATE TABLE IF NOT EXISTS temp_test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          data VARCHAR(255)
        )
      `);

      // Truncate all tables
      await connection.query("TRUNCATE TABLE whitelist_users");
      await connection.query("TRUNCATE TABLE whitelist_orders");
      await connection.query("TRUNCATE TABLE app_logs");
      await connection.query("TRUNCATE TABLE restricted_table");
      await connection.query("TRUNCATE TABLE temp_test_table");
    } finally {
      connection.release();
    }
  });

  describe("INSERT operations with TABLE_INSERT_WHITELIST", () => {
    it("should allow INSERT on table in INSERT whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('Test User')"
      );

      expect(result.isError).toBe(false);

      // Verify the record was inserted
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SELECT * FROM whitelist_users");
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("Test User");
      } finally {
        connection.release();
      }
    });

    it("should deny INSERT on table NOT in INSERT whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.restricted_table (data) VALUES ('Test Data')"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("INSERT operation not allowed");
      expect(result.content[0].text).toContain("TABLE_INSERT_WHITELIST");
      expect(result.content[0].text).toContain("mcp_test.restricted_table");
    });
  });

  describe("UPDATE operations with TABLE_UPDATE_WHITELIST", () => {
    beforeEach(async () => {
      const connection = await pool.getConnection();
      try {
        await connection.query(
          "INSERT INTO whitelist_users (name) VALUES ('User 1'), ('User 2')"
        );
        await connection.query(
          "INSERT INTO restricted_table (data) VALUES ('Data 1'), ('Data 2')"
        );
      } finally {
        connection.release();
      }
    });

    it("should allow UPDATE on table in UPDATE whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "UPDATE mcp_test.whitelist_users SET name = 'Updated User' WHERE id = 1"
      );

      expect(result.isError).toBe(false);

      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(
          "SELECT * FROM whitelist_users WHERE id = 1"
        );
        expect(rows[0].name).toBe("Updated User");
      } finally {
        connection.release();
      }
    });

    it("should deny UPDATE on table NOT in UPDATE whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "UPDATE mcp_test.restricted_table SET data = 'Updated' WHERE id = 1"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("UPDATE operation not allowed");
      expect(result.content[0].text).toContain("TABLE_UPDATE_WHITELIST");
    });
  });

  describe("DELETE operations with TABLE_DELETE_WHITELIST", () => {
    beforeEach(async () => {
      const connection = await pool.getConnection();
      try {
        await connection.query(
          "INSERT INTO whitelist_users (name) VALUES ('User 1'), ('User 2')"
        );
        await connection.query(
          "INSERT INTO restricted_table (data) VALUES ('Data 1'), ('Data 2')"
        );
      } finally {
        connection.release();
      }
    });

    it("should allow DELETE on table in DELETE whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "DELETE FROM mcp_test.whitelist_users WHERE id = 1"
      );

      expect(result.isError).toBe(false);

      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SELECT * FROM whitelist_users");
        expect(rows).toHaveLength(1);
      } finally {
        connection.release();
      }
    });

    it("should deny DELETE on table NOT in DELETE whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "DELETE FROM mcp_test.restricted_table WHERE id = 1"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DELETE operation not allowed");
      expect(result.content[0].text).toContain("TABLE_DELETE_WHITELIST");
    });
  });

  describe("CREATE TABLE operations are allowed without whitelist", () => {
    it("should allow CREATE TABLE for any table name", async () => {
      const result = await executeReadOnlyQuery(
        "CREATE TABLE mcp_test.temp_new_table (id INT PRIMARY KEY, data VARCHAR(255))"
      );

      expect(result.isError).toBe(false);

      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SHOW TABLES LIKE 'temp_new_table'");
        expect(rows.length).toBeGreaterThan(0);
        await connection.query("DROP TABLE mcp_test.temp_new_table");
      } finally {
        connection.release();
      }
    });
  });

  describe("ALTER TABLE operations with TABLE_DDL_ALTER_WHITELIST", () => {
    it("should allow ALTER TABLE for table in ALTER whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "ALTER TABLE mcp_test.whitelist_users ADD COLUMN age INT"
      );

      expect(result.isError).toBe(false);

      const connection = await pool.getConnection();
      try {
        const [columns] = await connection.query(
          "SHOW COLUMNS FROM mcp_test.whitelist_users LIKE 'age'"
        );
        expect(columns.length).toBeGreaterThan(0);
        await connection.query("ALTER TABLE mcp_test.whitelist_users DROP COLUMN age");
      } finally {
        connection.release();
      }
    });

    it("should deny ALTER TABLE for table NOT in ALTER whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "ALTER TABLE mcp_test.app_logs ADD COLUMN test_col INT"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ALTER operation not allowed");
      expect(result.content[0].text).toContain("TABLE_DDL_ALTER_WHITELIST");
    });
  });

  describe("DROP TABLE operations with TABLE_DDL_DROP_WHITELIST", () => {
    it("should allow DROP TABLE for table matching DROP whitelist pattern", async () => {
      // First create a temp table
      await pool.query("CREATE TABLE mcp_test.temp_to_drop (id INT)");

      const result = await executeReadOnlyQuery(
        "DROP TABLE mcp_test.temp_to_drop"
      );

      expect(result.isError).toBe(false);

      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SHOW TABLES LIKE 'temp_to_drop'");
        expect(rows.length).toBe(0);
      } finally {
        connection.release();
      }
    });

    it("should deny DROP TABLE for table NOT in DROP whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "DROP TABLE mcp_test.whitelist_users"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DROP operation not allowed");
      expect(result.content[0].text).toContain("TABLE_DDL_DROP_WHITELIST");
    });
  });

  describe("TRUNCATE operations with TABLE_DDL_TRUNCATE_WHITELIST", () => {
    beforeEach(async () => {
      const connection = await pool.getConnection();
      try {
        await connection.query(
          "INSERT INTO whitelist_users (name) VALUES ('User 1'), ('User 2')"
        );
        await connection.query(
          "INSERT INTO restricted_table (data) VALUES ('Data 1')"
        );
      } finally {
        connection.release();
      }
    });

    it("should allow TRUNCATE for table in TRUNCATE whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "TRUNCATE TABLE mcp_test.whitelist_users"
      );

      expect(result.isError).toBe(false);

      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SELECT * FROM whitelist_users");
        expect(rows).toHaveLength(0);
      } finally {
        connection.release();
      }
    });

    it("should deny TRUNCATE for table NOT in TRUNCATE whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "TRUNCATE TABLE mcp_test.restricted_table"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("TRUNCATE operation not allowed");
      expect(result.content[0].text).toContain("TABLE_DDL_TRUNCATE_WHITELIST");
    });
  });

  describe("Independent operation permissions", () => {
    it("should allow different permissions for INSERT vs UPDATE on same table", async () => {
      // This test verifies that each operation type is checked independently

      // INSERT should work (whitelist_users is in INSERT whitelist)
      const insertResult = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('Test User')"
      );
      expect(insertResult.isError).toBe(false);

      // UPDATE should also work (whitelist_users is in UPDATE whitelist)
      const updateResult = await executeReadOnlyQuery(
        "UPDATE mcp_test.whitelist_users SET name = 'Updated' WHERE id = 1"
      );
      expect(updateResult.isError).toBe(false);

      // DELETE should also work (whitelist_users is in DELETE whitelist)
      const deleteResult = await executeReadOnlyQuery(
        "DELETE FROM mcp_test.whitelist_users WHERE id = 1"
      );
      expect(deleteResult.isError).toBe(false);
    });
  });

  describe("Error message quality", () => {
    it("should include operation-specific whitelist name in error", async () => {
      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.restricted_table (data) VALUES ('Test')"
      );

      expect(result.isError).toBe(true);
      const errorText = result.content[0].text;

      expect(errorText).toContain("INSERT operation not allowed");
      expect(errorText).toContain("TABLE_INSERT_WHITELIST");
      expect(errorText).toContain("mcp_test.restricted_table");
      expect(errorText).toContain("💡 To execute this operation");
      expect(errorText).toContain("Ask your administrator");
    });

    it("should show different whitelist names for different operations", async () => {
      const insertResult = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.restricted_table (data) VALUES ('Test')"
      );
      expect(insertResult.content[0].text).toContain("TABLE_INSERT_WHITELIST");

      const updateResult = await executeReadOnlyQuery(
        "UPDATE mcp_test.restricted_table SET data = 'Updated' WHERE id = 1"
      );
      expect(updateResult.content[0].text).toContain("TABLE_UPDATE_WHITELIST");

      const deleteResult = await executeReadOnlyQuery(
        "DELETE FROM mcp_test.restricted_table WHERE id = 1"
      );
      expect(deleteResult.content[0].text).toContain("TABLE_DELETE_WHITELIST");
    });
  });

  describe("Wildcard pattern matching", () => {
    it("should match tables with wildcard patterns in whitelists", async () => {
      // temp_test_table matches temp_* pattern in CREATE whitelist
      const result = await executeReadOnlyQuery(
        "CREATE TABLE mcp_test.temp_wildcard_test (id INT PRIMARY KEY)"
      );

      expect(result.isError).toBe(false);

      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SHOW TABLES LIKE 'temp_wildcard_test'");
        expect(rows.length).toBeGreaterThan(0);
        await connection.query("DROP TABLE mcp_test.temp_wildcard_test");
      } finally {
        connection.release();
      }
    });
  });

  describe("SELECT operations bypass whitelist", () => {
    it("should allow SELECT on non-whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "SELECT * FROM mcp_test.restricted_table"
      );

      expect(result.isError).toBe(false);
    });

    it("should allow SELECT on whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "SELECT * FROM mcp_test.whitelist_users"
      );

      expect(result.isError).toBe(false);
    });
  });
});
