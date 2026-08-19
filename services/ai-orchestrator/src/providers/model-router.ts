export type ModelTaskType =
  | "planning"
  | "execution"
  | "review"
  | "fast"
  | "reasoning"
  | "economy";

export interface ModelRouteTarget {
  readonly modelAlias: string;
  readonly provider: string;
  readonly apiModel: string;
  readonly reasoningEffort?: "low" | "medium" | "high" | "max";
  readonly supportsThinking?: boolean;
}

export interface ModelRouterConfig {
  readonly primaryModel: string;
  readonly fallbackModel: string;
  readonly reasoningModel: string;
  readonly emergencyModel: string;
  readonly taskRoutes?: Partial<Record<ModelTaskType, string>>;
}

export interface FallbackChainResolution {
  readonly selected: ModelRouteTarget;
  readonly chain: readonly ModelRouteTarget[];
  readonly reason: string;
}

export const DEFAULT_MODEL_ROUTER_CONFIG: ModelRouterConfig = {
  primaryModel: "lucent",
  fallbackModel: "arete",
  reasoningModel: "noir",
  emergencyModel: "lucent",
  taskRoutes: {
    planning: "noir",
    reasoning: "noir",
    execution: "lucent",
    fast: "lucent",
    review: "arete",
    economy: "lucent",
  },
};

export class ModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly failureCounts = new Map<string, number>();

  constructor(config: Partial<ModelRouterConfig> = {}, env: NodeJS.ProcessEnv = process.env) {
    this.config = {
      primaryModel: env.PAAX_MODEL_PRIMARY ?? config.primaryModel ?? DEFAULT_MODEL_ROUTER_CONFIG.primaryModel,
      fallbackModel: env.PAAX_MODEL_FALLBACK ?? config.fallbackModel ?? DEFAULT_MODEL_ROUTER_CONFIG.fallbackModel,
      reasoningModel: env.PAAX_MODEL_REASONING ?? config.reasoningModel ?? DEFAULT_MODEL_ROUTER_CONFIG.reasoningModel,
      emergencyModel: env.PAAX_MODEL_EMERGENCY ?? config.emergencyModel ?? DEFAULT_MODEL_ROUTER_CONFIG.emergencyModel,
      taskRoutes: {
        ...DEFAULT_MODEL_ROUTER_CONFIG.taskRoutes,
        ...config.taskRoutes,
      },
    };
  }

  /**
   * Routes a task to the most suitable model profile target.
   */
  routeTask(taskType: ModelTaskType): ModelRouteTarget {
    const targetAlias = this.config.taskRoutes?.[taskType] ?? this.config.primaryModel;
    return this.resolveTarget(targetAlias, taskType);
  }

  /**
   * Resolves the fallback chain for a model alias, skipping models that have accumulated excessive failures.
   */
  resolveFallbackChain(preferredAlias?: string): FallbackChainResolution {
    const primaryAlias = preferredAlias ?? this.config.primaryModel;
    const candidates = [
      primaryAlias,
      this.config.fallbackModel,
      this.config.emergencyModel,
    ];

    // Deduplicate while maintaining priority order
    const uniqueAliases = Array.from(new Set(candidates));
    const chain = uniqueAliases.map((alias) => this.resolveTarget(alias));

    // Pick first candidate with acceptable failure count (< 3)
    let selected = chain[0];
    let reason = `Selected preferred model ${primaryAlias}`;

    for (const target of chain) {
      const failures = this.failureCounts.get(target.modelAlias) ?? 0;
      if (failures < 3) {
        selected = target;
        if (target.modelAlias !== primaryAlias) {
          reason = `Primary model degraded (${failures} errors), routed to fallback ${target.modelAlias}`;
        }
        break;
      }
    }

    return {
      selected,
      chain: Object.freeze(chain),
      reason,
    };
  }

  recordFailure(modelAlias: string): void {
    const count = this.failureCounts.get(modelAlias) ?? 0;
    this.failureCounts.set(modelAlias, count + 1);
  }

  recordSuccess(modelAlias: string): void {
    this.failureCounts.set(modelAlias, 0);
  }

  resetFailures(): void {
    this.failureCounts.clear();
  }

  private resolveTarget(alias: string, taskType?: ModelTaskType): ModelRouteTarget {
    switch (alias) {
      case "noir":
        return {
          modelAlias: "noir",
          provider: "opencode-go",
          apiModel: "mimo-v2.5",
          reasoningEffort: "max",
          supportsThinking: true,
        };
      case "arete":
        return {
          modelAlias: "arete",
          provider: "opencode-go",
          apiModel: "mimo-v2.5",
          reasoningEffort: "high",
          supportsThinking: true,
        };
      case "lucent":
      default:
        return {
          modelAlias: "lucent",
          provider: "opencode-go",
          apiModel: "mimo-v2.5",
          reasoningEffort: taskType === "planning" ? "max" : "high",
          supportsThinking: true,
        };
    }
  }
}

export function createModelRouter(config?: Partial<ModelRouterConfig>, env?: NodeJS.ProcessEnv): ModelRouter {
  return new ModelRouter(config, env);
}
