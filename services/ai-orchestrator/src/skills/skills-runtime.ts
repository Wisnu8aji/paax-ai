import type { LoadedSkill, SkillLoader, SkillSummary } from "./types";

export interface SkillRuntimeContext {
  readonly activeSkills: ReadonlyMap<string, LoadedSkill>;
  readonly availableSummaries: readonly SkillSummary[];
}

export interface ProgressiveDisclosurePrompt {
  readonly skillIndexSnippet: string;
  readonly activeSkillInstructions: string;
}

export class SkillsRuntime {
  private readonly activatedSkills = new Map<string, LoadedSkill>();

  constructor(private readonly loader: SkillLoader) {}

  /**
   * Activates a skill by name, loading its full markdown body into the active session context.
   */
  async activateSkill(name: string): Promise<LoadedSkill> {
    const existing = this.activatedSkills.get(name);
    if (existing) return existing;

    const skill = await this.loader.view(name);
    this.activatedSkills.set(name, skill);
    return skill;
  }

  deactivateSkill(name: string): boolean {
    return this.activatedSkills.delete(name);
  }

  getActiveSkills(): readonly LoadedSkill[] {
    return Object.freeze(Array.from(this.activatedSkills.values()));
  }

  clearActiveSkills(): void {
    this.activatedSkills.clear();
  }

  /**
   * Generates prompt snippets for progressive disclosure:
   * 1. A compact skill index of all available skills (to save tokens).
   * 2. Full instructions only for explicitly activated skills.
   */
  async generateDisclosurePrompts(): Promise<ProgressiveDisclosurePrompt> {
    const summaries = await this.loader.list();

    // Compact Index
    const indexLines = summaries.map((s) => `- **${s.name}** (v${s.version}): ${s.description}`);
    const skillIndexSnippet = indexLines.length > 0
      ? `## Available Skills\n${indexLines.join("\n")}\n\nActivate a skill using the skill tool to load full domain instructions when needed.`
      : "";

    // Active full instructions
    const activeSections: string[] = [];
    for (const active of this.activatedSkills.values()) {
      activeSections.push(`### Skill: ${active.metadata.name} (v${active.metadata.version})\n${active.body}`);
    }

    const activeSkillInstructions = activeSections.length > 0
      ? `## Active Domain Skills Instructions\n\n${activeSections.join("\n\n---\n\n")}`
      : "";

    return {
      skillIndexSnippet,
      activeSkillInstructions,
    };
  }
}

export function createSkillsRuntime(loader: SkillLoader): SkillsRuntime {
  return new SkillsRuntime(loader);
}
