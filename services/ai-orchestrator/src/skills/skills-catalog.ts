import type { LoadedSkill, SkillLoader, SkillMetadata, SkillScope, SkillSummary, SkillTrust } from "./types";

export interface SkillSearchFilter {
  readonly query?: string;
  readonly scope?: SkillScope;
  readonly trust?: SkillTrust;
  readonly tags?: readonly string[];
  readonly pinnedOnly?: boolean;
}

export class SkillsCatalog {
  private cachedSummaries: readonly SkillSummary[] | null = null;

  constructor(private readonly loader: SkillLoader) {}

  async list(filter: SkillSearchFilter = {}): Promise<readonly SkillSummary[]> {
    const all = await this.getAllSummaries();
    return Object.freeze(
      all.filter((skill) => {
        if (filter.scope && skill.scope !== filter.scope) return false;
        if (filter.trust && skill.trust !== filter.trust) return false;
        if (filter.pinnedOnly && !skill.pinned) return false;
        if (filter.query) {
          const q = filter.query.toLowerCase();
          const matchName = skill.name.toLowerCase().includes(q);
          const matchDesc = skill.description.toLowerCase().includes(q);
          if (!matchName && !matchDesc) return false;
        }
        return true;
      }),
    );
  }

  async get(name: string): Promise<LoadedSkill> {
    return this.loader.view(name);
  }

  async getSummary(name: string): Promise<SkillSummary | undefined> {
    const all = await this.getAllSummaries();
    return all.find((s) => s.name === name);
  }

  async refresh(): Promise<void> {
    this.cachedSummaries = await this.loader.list();
  }

  private async getAllSummaries(): Promise<readonly SkillSummary[]> {
    if (!this.cachedSummaries) {
      this.cachedSummaries = await this.loader.list();
    }
    return this.cachedSummaries;
  }
}

export function createSkillsCatalog(loader: SkillLoader): SkillsCatalog {
  return new SkillsCatalog(loader);
}
