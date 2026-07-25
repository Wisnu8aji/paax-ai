import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("premium UI cleanup", () => {
  it("does not keep legacy PAAX visual tokens on the active app shell", () => {
    const layout = readFileSync(resolve(__dirname, "layout.tsx"), "utf8");
    const globals = readFileSync(resolve(__dirname, "globals.css"), "utf8");

    expect(layout).not.toContain("bg-paax-bg");
    expect(layout).not.toContain("text-paax-text");
    expect(globals).not.toContain("--color-paax-");
    expect(globals).not.toContain(".glass-card");
    expect(globals).not.toContain(".btn-primary");
  });

});
