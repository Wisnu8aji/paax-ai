import { describe, expect, it, vi } from "vitest";
import {
  createHooksRegistry,
  createHooksEngine,
  HooksRegistryError,
} from "../../src/hooks";

describe("PAAX Hooks System (paax-hooks)", () => {
  describe("Hooks Registry", () => {
    it("registers and retrieves hooks by lifecycle and matcher", () => {
      const registry = createHooksRegistry();
      registry.register({
        id: "hook-1",
        name: "Pre-Tool Guard",
        lifecycle: "pre_tool_use",
        matcher: "terminal_run",
        handler: () => ({ action: "continue" }),
      });

      const preHooks = registry.getHooksForLifecycle("pre_tool_use", "terminal_run");
      expect(preHooks.length).toBe(1);
      expect(preHooks[0].id).toBe("hook-1");

      const unmatched = registry.getHooksForLifecycle("pre_tool_use", "file_read");
      expect(unmatched.length).toBe(0);
    });

    it("loads hooks from Codex JSON configuration format", () => {
      const registry = createHooksRegistry();
      registry.loadFromJsonConfig({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "graphify hook-check",
                },
              ],
            },
          ],
          SessionStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: "init-session",
                },
              ],
            },
          ],
        },
      });

      const bashHooks = registry.getHooksForLifecycle("pre_tool_use", "Bash");
      expect(bashHooks.length).toBe(1);
      expect(bashHooks[0].command).toBe("graphify hook-check");

      const sessionHooks = registry.getHooksForLifecycle("session_start");
      expect(sessionHooks.length).toBe(1);
    });
  });

  describe("Hooks Engine Execution", () => {
    it("executes hooks pipeline and allows continuation", async () => {
      const registry = createHooksRegistry();
      const fn = vi.fn().mockReturnValue({ action: "continue" });

      registry.register({
        id: "hook-log",
        name: "Logger",
        lifecycle: "user_prompt_submit",
        handler: fn,
      });

      const engine = createHooksEngine({ registry });
      const result = await engine.trigger("user_prompt_submit", {
        userPrompt: "Calculate RAB for column K1",
      });

      expect(result.action).toBe("continue");
      expect(fn).toHaveBeenCalledOnce();
    });

    it("halts execution when a hook returns block", async () => {
      const registry = createHooksRegistry();
      registry.register({
        id: "hook-blocker",
        name: "Security Blocker",
        lifecycle: "pre_tool_use",
        handler: () => ({ action: "block", reason: "Tool invocation disallowed by security policy" }),
      });

      const engine = createHooksEngine({ registry });
      const result = await engine.trigger("pre_tool_use", {
        toolName: "dangerous_op",
      });

      expect(result.action).toBe("block");
      expect(result.reason).toContain("disallowed");
    });

    it("cascades modified metadata across sequential hooks", async () => {
      const registry = createHooksRegistry();
      registry.register({
        id: "hook-mod-1",
        name: "Modifier 1",
        lifecycle: "turn_complete",
        priority: 20,
        handler: () => ({ action: "modify", data: { step1: "done" } }),
      });
      registry.register({
        id: "hook-mod-2",
        name: "Modifier 2",
        lifecycle: "turn_complete",
        priority: 10,
        handler: (ctx) => ({
          action: "modify",
          data: { step2: "done", prev: ctx.metadata?.step1 },
        }),
      });

      const engine = createHooksEngine({ registry });
      const result = await engine.trigger("turn_complete", {});

      expect(result.action).toBe("continue");
      expect(result.data?.step1).toBe("done");
      expect(result.data?.step2).toBe("done");
      expect(result.data?.prev).toBe("done");
    });
  });
});
