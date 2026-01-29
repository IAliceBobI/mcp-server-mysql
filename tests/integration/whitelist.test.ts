// Load environment variables FIRST before any other imports
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

import * as mysql2 from "mysql2/promise";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  executeReadOnlyQuery,
} from "../../dist/src/db/index.js";

// Whitelist from .env.test: mcp_test.whitelist_users,mcp_test.whitelist_orders,mcp_test.app_logs
const WHITELISTED_TABLES = ["mcp_test.whitelist_users", "mcp_test.whitelist_orders", "mcp_test.app_logs"];

describe("Whitelist Integration", () => {
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

    // Only add password if it's set
    if (process.env.MYSQL_PASS) {
      config.password = process.env.MYSQL_PASS;
    }

    pool = mysql2.createPool(config);

    // Create test tables (including one NOT in whitelist)
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

      // This table is NOT in whitelist for testing
      await connection.query(`
        CREATE TABLE IF NOT EXISTS restricted_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          data VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } finally {
      connection.release();
    }
  });

  afterAll(async () => {
    // Clean up test tables
    if (pool) {
      const connection = await pool.getConnection();
      try {
        await connection.query("DROP TABLE IF EXISTS whitelist_users");
        await connection.query("DROP TABLE IF EXISTS whitelist_orders");
        await connection.query("DROP TABLE IF EXISTS app_logs");
        await connection.query("DROP TABLE IF EXISTS restricted_table");
      } finally {
        connection.release();
      }
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clear all tables before each test
    const connection = await pool.getConnection();
    try {
      await connection.query("TRUNCATE TABLE whitelist_users");
      await connection.query("TRUNCATE TABLE whitelist_orders");
      await connection.query("TRUNCATE TABLE app_logs");
      await connection.query("TRUNCATE TABLE restricted_table");
    } finally {
      connection.release();
    }
  });

  describe("SELECT queries not restricted by whitelist", () => {
    it("should allow SELECT on whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "SELECT * FROM whitelist_users"
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBeDefined();
    });

    it("should allow SELECT on non-whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "SELECT * FROM restricted_table"
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe("INSERT operations with whitelist", () => {
    it("should allow INSERT on whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('Test User')"
      );

      expect(result.isError).toBe(false);

      // Verify the record was actually inserted
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SELECT * FROM whitelist_users");
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("Test User");
      } finally {
        connection.release();
      }
    });

    it("should deny INSERT on non-whitelisted table with friendly error", async () => {
      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.restricted_table (data) VALUES ('Test Data')"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("INSERT operation not allowed");
      expect(result.content[0].text).toContain("mcp_test.restricted_table");
      expect(result.content[0].text).toContain("TABLE_INSERT_WHITELIST");
      expect(result.content[0].text).toContain("INSERT INTO mcp_test.restricted_table");
    });
  });

  describe("UPDATE operations with whitelist", () => {
    beforeEach(async () => {
      // Insert test data
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

    it("should allow UPDATE on whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "UPDATE mcp_test.whitelist_users SET name = 'Updated User' WHERE id = 1"
      );

      expect(result.isError).toBe(false);

      // Verify the record was actually updated
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

    it("should deny UPDATE on non-whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "UPDATE mcp_test.restricted_table SET data = 'Updated' WHERE id = 1"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("UPDATE operation not allowed");
      expect(result.content[0].text).toContain("mcp_test.restricted_table");
    });
  });

  describe("DELETE operations with whitelist", () => {
    beforeEach(async () => {
      // Insert test data
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

    it("should allow DELETE on whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "DELETE FROM mcp_test.whitelist_users WHERE id = 1"
      );

      expect(result.isError).toBe(false);

      // Verify the record was actually deleted
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SELECT * FROM whitelist_users");
        expect(rows).toHaveLength(1);
      } finally {
        connection.release();
      }
    });

    it("should deny DELETE on non-whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "DELETE FROM mcp_test.restricted_table WHERE id = 1"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DELETE operation not allowed");
    });
  });

  describe("Multiple whitelisted tables", () => {
    it("should allow INSERT on all whitelisted tables", async () => {
      const result1 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('User 1')"
      );
      expect(result1.isError).toBe(false);

      const result2 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_orders (user_id, total) VALUES (1, 50.00)"
      );
      expect(result2.isError).toBe(false);

      const result3 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.app_logs (message, level) VALUES ('Test log', 'INFO')"
      );
      expect(result3.isError).toBe(false);
    });

    it("should deny INSERT on table not in whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.restricted_table (data) VALUES ('Should Fail')"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("INSERT operation not allowed");
    });
  });

  describe("Error message quality", () => {
    it("should include helpful information in error message", async () => {
      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.restricted_table (data) VALUES ('Test')"
      );

      expect(result.isError).toBe(true);
      const errorText = result.content[0].text;

      // Check for all required elements
      expect(errorText).toContain("❌ Error: INSERT operation not allowed");
      expect(errorText).toContain("mcp_test.restricted_table");
      expect(errorText).toContain("TABLE_INSERT_WHITELIST");
      expect(errorText).toContain("INSERT INTO mcp_test.restricted_table");
      expect(errorText).toContain("💡 To execute this operation");
      expect(errorText).toContain("Ask your administrator");
      expect(errorText).toContain("execute the SQL manually");
    });
  });

  describe("CREATE TABLE operations require whitelist", () => {
    it("should allow CREATE TABLE for table matching CREATE whitelist pattern", async () => {
      const result = await executeReadOnlyQuery(
        "CREATE TABLE mcp_test.temp_created_table (id INT PRIMARY KEY, data VARCHAR(255))"
      );

      expect(result.isError).toBe(false);

      // Verify the table was actually created
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SHOW TABLES LIKE 'temp_created_table'");
        expect(rows.length).toBeGreaterThan(0);

        // Clean up
        await connection.query("DROP TABLE mcp_test.temp_created_table");
      } finally {
        connection.release();
      }
    });

    it("should deny CREATE TABLE for table NOT in CREATE whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "CREATE TABLE mcp_test.restricted_table (id INT PRIMARY KEY)"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("CREATE operation not allowed");
      expect(result.content[0].text).toContain("TABLE_DDL_CREATE_WHITELIST");
    });

    it("should allow CREATE TABLE with IF NOT EXISTS for table in whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "CREATE TABLE IF NOT EXISTS mcp_test.temp_another_table (id INT, name TEXT)"
      );

      expect(result.isError).toBe(false);

      // Verify the table was created
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SHOW TABLES LIKE 'temp_another_table'");
        expect(rows.length).toBeGreaterThan(0);

        // Clean up
        await connection.query("DROP TABLE IF EXISTS mcp_test.temp_another_table");
      } finally {
        connection.release();
      }
    });
  });

  describe("Other DDL operations require whitelist", () => {
    beforeEach(async () => {
      // Create a table to test ALTER and DROP
      const connection = await pool.getConnection();
      try {
        await connection.query(
          "CREATE TABLE IF NOT EXISTS mcp_test.restricted_for_alter (id INT PRIMARY KEY)"
        );
      } finally {
        connection.release();
      }
    });

    it("should deny ALTER TABLE for table NOT in whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "ALTER TABLE mcp_test.restricted_for_alter ADD COLUMN data VARCHAR(255)"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ALTER operation not allowed");
      expect(result.content[0].text).toContain("mcp_test.restricted_for_alter");
    });

    it("should deny DROP TABLE for table NOT in whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "DROP TABLE mcp_test.restricted_for_alter"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DROP operation not allowed");
    });

    it("should allow ALTER TABLE for table in whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "ALTER TABLE mcp_test.whitelist_users ADD COLUMN age INT"
      );

      expect(result.isError).toBe(false);

      // Verify the column was added
      const connection = await pool.getConnection();
      try {
        const [columns] = await connection.query(
          "SHOW COLUMNS FROM mcp_test.whitelist_users LIKE 'age'"
        );
        expect(columns.length).toBeGreaterThan(0);

        // Clean up - remove the added column
        await connection.query("ALTER TABLE mcp_test.whitelist_users DROP COLUMN age");
      } finally {
        connection.release();
      }
    });
  });

  describe("TRUNCATE operations require whitelist", () => {
    beforeEach(async () => {
      // Insert test data
      const connection = await pool.getConnection();
      try {
        await connection.query(
          "INSERT INTO restricted_table (data) VALUES ('Data 1'), ('Data 2')"
        );
      } finally {
        connection.release();
      }
    });

    it("should deny TRUNCATE for table NOT in whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "TRUNCATE TABLE mcp_test.restricted_table"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("TRUNCATE operation not allowed");
    });

    it("should allow TRUNCATE for table in whitelist", async () => {
      // First insert data
      await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('User 1'), ('User 2')"
      );

      // Then truncate
      const result = await executeReadOnlyQuery(
        "TRUNCATE TABLE mcp_test.whitelist_users"
      );

      expect(result.isError).toBe(false);

      // Verify the table was truncated
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query("SELECT * FROM whitelist_users");
        expect(rows).toHaveLength(0);
      } finally {
        connection.release();
      }
    });
  });
});
