import { describe, it, expect, beforeEach } from "vitest";
import { matchWildcard } from "../../dist/src/db/permissions.js";
import { extractTableFromQuery } from "../../dist/src/db/utils.js";

describe("Table Whitelist", () => {
  describe("Wildcard Matching", () => {
    it("*.logs matches dev.logs and prod.logs", () => {
      expect(matchWildcard("dev.logs", "*.logs")).toBe(true);
      expect(matchWildcard("prod.logs", "*.logs")).toBe(true);
      expect(matchWildcard("dev.log_table", "*.logs")).toBe(false);
    });

    it("production.* matches all tables in that database", () => {
      expect(matchWildcard("production.users", "production.*")).toBe(true);
      expect(matchWildcard("production.orders", "production.*")).toBe(true);
      expect(matchWildcard("dev.users", "production.*")).toBe(false);
    });

    it("dev.test_* matches tables starting with test_ in dev database", () => {
      expect(matchWildcard("dev.test_1", "dev.test_*")).toBe(true);
      expect(matchWildcard("dev.test_temp", "dev.test_*")).toBe(true);
      expect(matchWildcard("dev.prod_1", "dev.test_*")).toBe(false);
      expect(matchWildcard("prod.test_1", "dev.test_*")).toBe(false);
    });

    it("*.* matches all tables", () => {
      expect(matchWildcard("any.table", "*.*")).toBe(true);
      expect(matchWildcard("production.users", "*.*")).toBe(true);
    });

    it("Exact match requires exact table name", () => {
      expect(matchWildcard("production.users", "production.users")).toBe(true);
      expect(matchWildcard("dev.users", "production.users")).toBe(false);
    });
  });

  describe("Table Name Extraction", () => {
    it("Extracts table name from INSERT query", () => {
      const sql = "INSERT INTO production.users (name) VALUES ('test')";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("production.users");
    });

    it("Extracts table name from UPDATE query", () => {
      const sql = "UPDATE dev.users SET name='test' WHERE id=1";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("dev.users");
    });

    it("Extracts table name from DELETE query", () => {
      const sql = "DELETE FROM production.orders WHERE id=1";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("production.orders");
    });

    it("Extracts table name from SELECT query", () => {
      const sql = "SELECT * FROM test.products WHERE price > 100";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("test.products");
    });

    it("Handles queries with explicit database prefix", () => {
      const sql = "SELECT * FROM mydb.mytable";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("mydb.mytable");
    });

    it("Returns null for queries without table", () => {
      const sql = "SELECT 1";
      const table = extractTableFromQuery(sql);
      expect(table).toBeNull();
    });

    it("Uses default database when no prefix", () => {
      process.env.MYSQL_DB = "default_db";
      const sql = "SELECT * FROM users";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("default_db.users");
      delete process.env.MYSQL_DB;
    });
  });

  describe("Table Name Extraction", () => {
    it("Extracts table name from INSERT query", () => {
      const sql = "INSERT INTO production.users (name) VALUES ('test')";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("production.users");
    });

    it("Extracts table name from UPDATE query", () => {
      const sql = "UPDATE dev.users SET name='test' WHERE id=1";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("dev.users");
    });

    it("Extracts table name from DELETE query", () => {
      const sql = "DELETE FROM production.orders WHERE id=1";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("production.orders");
    });

    it("Extracts table name from SELECT query", () => {
      const sql = "SELECT * FROM test.products WHERE price > 100";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("test.products");
    });

    it("Extracts table name from CREATE TABLE query", () => {
      const sql = "CREATE TABLE production.new_users (id INT PRIMARY KEY)";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("production.new_users");
    });

    it("Extracts table name from CREATE TABLE with IF NOT EXISTS", () => {
      const sql = "CREATE TABLE IF NOT EXISTS dev.temp_table (id INT)";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("dev.temp_table");
    });

    it("Extracts table name from ALTER TABLE query", () => {
      const sql = "ALTER TABLE test.users ADD COLUMN age INT";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("test.users");
    });

    it("Extracts table name from DROP TABLE query", () => {
      const sql = "DROP TABLE production.old_table";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("production.old_table");
    });

    it("Handles queries with explicit database prefix", () => {
      const sql = "SELECT * FROM mydb.mytable";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("mydb.mytable");
    });

    it("Returns null for queries without table", () => {
      const sql = "SELECT 1";
      const table = extractTableFromQuery(sql);
      expect(table).toBeNull();
    });

    it("Uses default database when no prefix", () => {
      process.env.MYSQL_DB = "default_db";
      const sql = "SELECT * FROM users";
      const table = extractTableFromQuery(sql);
      expect(table).toBe("default_db.users");
      delete process.env.MYSQL_DB;
    });
  });

  describe("Whitelist Permission Integration", () => {
    it("Tests whitelist pattern matching directly", () => {
      // Test with whitelist array
      const whitelist = ["production.users", "*.logs", "dev.test_*"];

      // Test exact match
      expect(whitelist.some(pattern => matchWildcard("production.users", pattern))).toBe(true);

      // Test wildcard matches
      expect(whitelist.some(pattern => matchWildcard("dev.logs", pattern))).toBe(true);
      expect(whitelist.some(pattern => matchWildcard("prod.logs", pattern))).toBe(true);
      expect(whitelist.some(pattern => matchWildcard("dev.test_temp", pattern))).toBe(true);

      // Test non-matches
      expect(whitelist.some(pattern => matchWildcard("production.orders", pattern))).toBe(false);
      expect(whitelist.some(pattern => matchWildcard("dev.prod_1", pattern))).toBe(false);
    });

    it("Handles empty whitelist", () => {
      const whitelist: string[] = [];
      expect(whitelist.some(pattern => matchWildcard("any.table", pattern))).toBe(false);
    });

    it("Handles *.* pattern", () => {
      const whitelist = ["*.*"];
      expect(whitelist.some(pattern => matchWildcard("any.table", pattern))).toBe(true);
      expect(whitelist.some(pattern => matchWildcard("production.users", pattern))).toBe(true);
    });
  });
});
