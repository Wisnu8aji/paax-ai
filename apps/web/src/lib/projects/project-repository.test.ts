import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "@/lib/local-storage";
import { projectRepository } from "./project-repository";

function installLocalStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
}

describe("project repository cached snapshots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads localStorage projects synchronously for first dashboard paint", () => {
    installLocalStorage({
      [STORAGE_KEYS.PROJECTS]: JSON.stringify([
        { id: "old", name: "Proyek Lama", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "new", name: "Proyek Baru", updatedAt: "2026-02-01T00:00:00.000Z" },
      ]),
    });

    const projects = projectRepository.cachedList();

    expect(projects.map((project) => project.id)).toEqual(["new", "old"]);
    expect(projects[0].client).toBe("Belum diisi");
  });
});
