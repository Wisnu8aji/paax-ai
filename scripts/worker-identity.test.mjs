import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { generateManifest, verifyManifest } from "./worker-identity.mjs";

test("worker identity detects mismatch, missing, and unexpected files", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "paax-worker-identity-"));
  const sourceDirectory = path.join(fixtureRoot, "services", "ai-orchestrator", "src");
  const firstFile = path.join(sourceDirectory, "first.ts");
  const secondFile = path.join(sourceDirectory, "second.ts");
  const thirdFile = path.join(sourceDirectory, "third.ts");

  try {
    mkdirSync(sourceDirectory, { recursive: true });
    writeFileSync(firstFile, "export const first = 1;\n", "utf8");
    writeFileSync(secondFile, "export const second = 2;\n", "utf8");

    const firstManifest = generateManifest({ rootDirectory: fixtureRoot });
    const secondManifest = generateManifest({ rootDirectory: fixtureRoot });
    assert.equal(firstManifest.counts.totalFiles, 2);
    assert.deepEqual(firstManifest.files, secondManifest.files);
    assert.deepEqual(verifyManifest({ rootDirectory: fixtureRoot }), {
      manifest: secondManifest,
      missing: [],
      unexpected: [],
      mismatch: [],
      match: [
        "services/ai-orchestrator/src/first.ts",
        "services/ai-orchestrator/src/second.ts",
      ],
    });

    const tampered = readFileSync(secondFile);
    tampered[0] ^= 1;
    writeFileSync(secondFile, tampered);
    assert.deepEqual(verifyManifest({ rootDirectory: fixtureRoot }).mismatch, [
      "services/ai-orchestrator/src/second.ts",
    ]);

    writeFileSync(secondFile, "export const second = 2;\n", "utf8");
    rmSync(secondFile);
    assert.deepEqual(verifyManifest({ rootDirectory: fixtureRoot }).missing, [
      "services/ai-orchestrator/src/second.ts",
    ]);

    writeFileSync(secondFile, "export const second = 2;\n", "utf8");
    writeFileSync(thirdFile, "export const third = 3;\n", "utf8");
    assert.deepEqual(verifyManifest({ rootDirectory: fixtureRoot }).unexpected, [
      "services/ai-orchestrator/src/third.ts",
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
