export type SkillScope = "project" | "user" | "system";
export type SkillTrust = "trusted" | "untrusted" | "quarantined";
export type SkillTrigger = "manual" | "explicit";

export interface SkillMetadata {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly scope: SkillScope;
  readonly trust: SkillTrust;
  readonly trigger: SkillTrigger;
  readonly allowedTools: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly pinned: boolean;
}

export interface SkillProvenance {
  readonly rootId: string;
  readonly relativePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface SkillSummary extends SkillMetadata {
  readonly provenance: SkillProvenance;
}

export interface LoadedSkill {
  readonly metadata: SkillMetadata;
  readonly body: string;
  readonly trusted: boolean;
  readonly provenance: SkillProvenance;
}

export interface SkillActorContext {
  readonly actorId: string;
  readonly projectId?: string;
  readonly allowedScopes: readonly string[];
  readonly allowedTools: readonly string[];
  readonly canManageSkills?: boolean;
}

export interface SkillMutationInput {
  readonly action: "create" | "update" | "delete";
  readonly name: string;
  readonly content?: string;
}

export interface SkillMutationPort {
  mutate(input: SkillMutationInput): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface SkillRootConfig {
  readonly id: string;
  readonly root: string;
}

export interface SkillLoaderOptions {
  readonly roots: readonly SkillRootConfig[];
  readonly maxMetadataBytes?: number;
  readonly maxBodyBytes?: number;
}

export interface SkillLoader {
  list(): Promise<readonly SkillSummary[]>;
  view(input: string | { name: string; maxBodyBytes?: number; signal?: AbortSignal }): Promise<LoadedSkill>;
}
