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
      expect(result.content[0].text).toContain("Write operation not allowed");
      expect(result.content[0].text).toContain("mcp_test.restricted_table");
      expect(result.content[0].text).toContain("TABLE_WRITE_WHITELIST");
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
      expect(result.content[0].text).toContain("Write operation not allowed");
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
      expect(result.content[0].text).toContain("Write operation not allowed");
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
      expect(result.content[0].text).toContain("Write operation not allowed");
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
      expect(errorText).toContain("❌ Error: Write operation not allowed");
      expect(errorText).toContain("mcp_test.restricted_table");
      expect(errorText).toContain("TABLE_WRITE_WHITELIST");
      expect(errorText).toContain("INSERT INTO mcp_test.restricted_table");
      expect(errorText).toContain("💡 To execute this operation");
      expect(errorText).toContain("Ask your administrator");
      expect(errorText).toContain("execute the SQL manually");
    });
  });
});
