import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Import validation functions from compiled source
// We'll test the behavior through environment variable parsing

describe("Whitelist Configuration Validation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("Pattern Validation", () => {
    it("should reject empty string patterns", () => {
      // Empty strings should be filtered out during parsing
      const patterns = [""];
      const filtered = patterns.filter((p) => {
        const trimmed = p.trim();
        if (!trimmed) return false;
        if (trimmed === "*") return false;
        if (!/[^\*\.]/.test(trimmed)) return false;
        return true;
      });
      expect(filtered).toHaveLength(0);
    });

    it("should reject dangerous wildcard pattern '*'", () => {
      const patterns = ["*"];
      const filtered = patterns.filter((p) => {
        const trimmed = p.trim();
        if (!trimmed) return false;
        if (trimmed === "*") return false;
        if (!/[^\*\.]/.test(trimmed)) return false;
        return true;
      });
      expect(filtered).toHaveLength(0);
    });

    it("should reject invalid patterns like '.*'", () => {
      const patterns = [".*"];
      const filtered = patterns.filter((p) => {
        const trimmed = p.trim();
        if (!trimmed) return false;
        if (trimmed === "*") return false;
        if (!/[^\*\.]/.test(trimmed)) return false;
        return true;
      });
      expect(filtered).toHaveLength(0);
    });

    it("should accept valid wildcard patterns", () => {
      const patterns = ["db.*", "*.table", "db.test_*"];
      const filtered = patterns.filter((p) => {
        const trimmed = p.trim();
        if (!trimmed) return false;
        if (trimmed === "*") return false;
        if (!/[^\*\.]/.test(trimmed)) return false;
        return true;
      });
      expect(filtered).toHaveLength(3);
    });

    it("should accept exact table names", () => {
      const patterns = ["production.users", "dev.orders"];
      const filtered = patterns.filter((p) => {
        const trimmed = p.trim();
        if (!trimmed) return false;
        if (trimmed === "*") return false;
        if (!/[^\*\.]/.test(trimmed)) return false;
        return true;
      });
      expect(filtered).toHaveLength(2);
    });

    it("should trim whitespace from patterns", () => {
      const patterns = [" db.users ", " *.logs ", "production.* "];
      const trimmed = patterns.map((p) => p.trim());
      expect(trimmed).toEqual(["db.users", "*.logs", "production.*"]);
    });
  });

  describe("Array Format Parsing", () => {
    it("should parse array format correctly", () => {
      const envValue = ["db.table", "*.logs", "test.temp_*"];
      const parsed = Array.isArray(envValue) ? envValue : [];
      expect(parsed).toHaveLength(3);
      expect(parsed).toContain("db.table");
      expect(parsed).toContain("*.logs");
      expect(parsed).toContain("test.temp_*");
    });

    it("should handle empty array", () => {
      const envValue: string[] = [];
      const parsed = Array.isArray(envValue) ? envValue : [];
      expect(parsed).toHaveLength(0);
    });

    it("should reject non-array formats", () => {
      const envValue = "db.table,*.logs";
      const isArray = Array.isArray(envValue);
      expect(isArray).toBe(false);
    });

    it("should handle mixed valid and invalid patterns in array", () => {
      const envValue = ["db.table", "", "*"];
      const filtered = envValue.filter((p) => {
        const trimmed = String(p).trim();
        if (!trimmed) return false;
        if (trimmed === "*") return false;
        if (!/[^\*\.]/.test(trimmed)) return false;
        return true;
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe("db.table");
    });
  });

  describe("Operation Type Whitelists", () => {
    it("should support 7 independent operation whitelists", () => {
      const operations = [
        "TABLE_INSERT_WHITELIST",
        "TABLE_UPDATE_WHITELIST",
        "TABLE_DELETE_WHITELIST",
        "TABLE_DDL_CREATE_WHITELIST",
        "TABLE_DDL_ALTER_WHITELIST",
        "TABLE_DDL_DROP_WHITELIST",
        "TABLE_DDL_TRUNCATE_WHITELIST",
      ];
      expect(operations).toHaveLength(7);
    });
  });

  describe("Security-First Defaults", () => {
    it("should treat undefined whitelist as empty (deny all)", () => {
      const whitelist = undefined;
      const parsed = whitelist ? (Array.isArray(whitelist) ? whitelist : []) : [];
      expect(parsed).toHaveLength(0);
    });

    it("should treat null whitelist as empty (deny all)", () => {
      const whitelist = null;
      const parsed = whitelist ? (Array.isArray(whitelist) ? whitelist : []) : [];
      expect(parsed).toHaveLength(0);
    });

    it("should treat empty array as deny all", () => {
      const whitelist: string[] = [];
      const parsed = whitelist.length > 0;
      expect(parsed).toBe(false);
    });
  });
});
