import { describe, expect, it } from "vitest";
import {
  createRulesEngine,
  parseRulesContent,
  DEFAULT_RULES,
  DEFAULT_RULES_TEXT,
  RulesLoadError,
} from "../../src/rules";

describe("PAAX Rules System (paax-rules)", () => {
  describe("RulesEngine Evaluation", () => {
    it("allows standard development prefix commands by default", () => {
      const engine = createRulesEngine();
      expect(engine.isAllowed("pnpm test")).toBe(true);
      expect(engine.isAllowed("npm run build")).toBe(true);
      expect(engine.isAllowed("python -m pytest")).toBe(true);
      expect(engine.isAllowed("git status")).toBe(true);
      expect(engine.isAllowed("git diff")).toBe(true);
    });

    it("blocks destructive root commands via high-priority deny regex", () => {
      const engine = createRulesEngine();
      expect(engine.isDenied("rm -rf /")).toBe(true);
      expect(engine.isDenied("rm -fr /")).toBe(true);
      expect(engine.isDenied("format c:")).toBe(true);
      expect(engine.isDenied("mkfs.ext4 /dev/sda1")).toBe(true);
      expect(engine.isDenied("powershell -Verb RunAs")).toBe(true);
    });

    it("evaluates custom prefix, exact, and regex rules correctly", () => {
      const engine = createRulesEngine({ initialRules: [] });
      engine.addRule({
        id: "r1",
        type: "prefix",
        pattern: ["echo", "hello"],
        decision: "allow",
      });
      engine.addRule({
        id: "r2",
        type: "exact",
        pattern: ["pwd"],
        decision: "allow",
      });
      engine.addRule({
        id: "r3",
        type: "regex",
        pattern: /dangerous-tool\s+--force/i,
        decision: "deny",
        priority: 100,
      });

      expect(engine.evaluate("echo hello world").decision).toBe("allow");
      expect(engine.evaluate("pwd").decision).toBe("allow");
      expect(engine.evaluate("pwd --extra").decision).toBe("ask"); // default fallback
      expect(engine.evaluate("dangerous-tool --force").decision).toBe("deny");
    });
  });

  describe("Rules Parser", () => {
    it("parses Codex .rules DSL syntax correctly", () => {
      const rules = parseRulesContent(DEFAULT_RULES_TEXT);
      expect(rules.length).toBeGreaterThan(5);

      const pnpmRule = rules.find((r) => Array.isArray(r.pattern) && r.pattern[0] === "pnpm");
      expect(pnpmRule).toBeDefined();
      expect(pnpmRule?.decision).toBe("allow");

      const rmRule = rules.find((r) => r.type === "regex");
      expect(rmRule).toBeDefined();
      expect(rmRule?.decision).toBe("deny");
    });

    it("throws a descriptive error on malformed syntax", () => {
      expect(() => parseRulesContent("invalid_function_call")).toThrow(RulesLoadError);
    });
  });
});
