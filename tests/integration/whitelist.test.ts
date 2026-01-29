import * as mysql2 from "mysql2/promise";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as dotenv from "dotenv";
import {
  executeReadOnlyQuery,
} from "../../dist/src/db/index.js";
import * as path from "path";
import { fileURLToPath } from "url";

// Set test directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

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
    } finally {
      connection.release();
    }
  });

  describe("SELECT queries not restricted by whitelist", () => {
    beforeEach(() => {
      // Empty whitelist = read-only mode
      process.env.TABLE_WRITE_WHITELIST = "";
    });

    it("should allow SELECT on non-whitelisted table", async () => {
      const result = await executeReadOnlyQuery(
        "SELECT * FROM whitelist_users"
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBeDefined();
    });

    it("should allow SELECT on any table regardless of whitelist", async () => {
      const result = await executeReadOnlyQuery(
        "SELECT * FROM whitelist_orders"
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe("INSERT operations with whitelist", () => {
    it("should allow INSERT on whitelisted table", async () => {
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.whitelist_users";

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
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.whitelist_users";

      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_orders (user_id, total) VALUES (1, 100.00)"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Write operation not allowed");
      expect(result.content[0].text).toContain("mcp_test.whitelist_orders");
      expect(result.content[0].text).toContain("TABLE_WRITE_WHITELIST");
      expect(result.content[0].text).toContain("INSERT INTO mcp_test.whitelist_orders");
    });

    it("should deny INSERT when whitelist is empty", async () => {
      process.env.TABLE_WRITE_WHITELIST = "";

      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('Test User')"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Write operation not allowed");
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
      } finally {
        connection.release();
      }
    });

    it("should allow UPDATE on whitelisted table", async () => {
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.whitelist_users";

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
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.whitelist_orders";

      const result = await executeReadOnlyQuery(
        "UPDATE mcp_test.whitelist_users SET name = 'Updated User' WHERE id = 1"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Write operation not allowed");
      expect(result.content[0].text).toContain("mcp_test.whitelist_users");
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
      } finally {
        connection.release();
      }
    });

    it("should allow DELETE on whitelisted table", async () => {
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.whitelist_users";

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
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.whitelist_orders";

      const result = await executeReadOnlyQuery(
        "DELETE FROM mcp_test.whitelist_users WHERE id = 1"
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Write operation not allowed");
    });
  });

  describe("Wildcard patterns in whitelist", () => {
    it("should match tables with *.logs pattern", async () => {
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.app_logs,*.logs";

      const result = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.app_logs (message, level) VALUES ('Test log', 'INFO')"
      );

      expect(result.isError).toBe(false);
    });

    it("should match all tables in database with mcp_test.* pattern", async () => {
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.*";

      const result1 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('User 1')"
      );
      expect(result1.isError).toBe(false);

      const result2 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_orders (user_id, total) VALUES (1, 50.00)"
      );
      expect(result2.isError).toBe(false);
    });

    it("should match tables with prefix pattern mcp_test.whitelist_*", async () => {
      process.env.TABLE_WRITE_WHITELIST = "mcp_test.whitelist_*";

      const result1 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('User 1')"
      );
      expect(result1.isError).toBe(false);

      const result2 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_orders (user_id, total) VALUES (1, 50.00)"
      );
      expect(result2.isError).toBe(false);

      // app_logs should not match
      const result3 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.app_logs (message, level) VALUES ('Test', 'INFO')"
      );
      expect(result3.isError).toBe(true);
    });
  });

  describe("Multiple patterns in whitelist", () => {
    it("should support comma-separated patterns", async () => {
      process.env.TABLE_WRITE_WHITELIST =
        "mcp_test.whitelist_users,mcp_test.app_logs";

      const result1 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_users (name) VALUES ('User 1')"
      );
      expect(result1.isError).toBe(false);

      const result2 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.app_logs (message, level) VALUES ('Test', 'INFO')"
      );
      expect(result2.isError).toBe(false);

      // orders should not be in whitelist
      const result3 = await executeReadOnlyQuery(
        "INSERT INTO mcp_test.whitelist_orders (user_id, total) VALUES (1, 50.00)"
      );
      expect(result3.isError).toBe(true);
    });
  });
});
