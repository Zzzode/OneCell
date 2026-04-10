export type Profile = 'claw' | 'terminal';
export type LlmProviderType = 'anthropic' | 'openai' | 'local';

export interface ProviderDefinition {
  type: LlmProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface NanoclawConfigFile {
  profile?: Profile;
  executionMode?: 'edge' | 'container' | 'auto';
  edgeRunnerMode?: 'edgejs' | 'node';
  providers: Record<string, ProviderDefinition>;
  edge?: {
    provider?: string;
    enableTools?: boolean;
    disableFallback?: boolean;
  };
  container?: {
    provider?: string;
    maxConcurrent?: number;
  };
}

export interface ResolvedProvider {
  name: string;
  type: LlmProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface ResolvedNanoclawConfig {
  profile: Profile;
  executionMode: 'edge' | 'container' | 'auto';
  edgeRunnerMode: 'edgejs' | 'node';
  providers: Record<string, ResolvedProvider>;
  edgeProvider: ResolvedProvider;
  containerProvider: ResolvedProvider;
  edge: {
    enableTools: boolean;
    disableFallback: boolean;
  };
  container: {
    maxConcurrent: number;
  };
}

/**
 * Replace ${VAR} patterns in a string with the corresponding environment
 * variable value. Missing variables resolve to an empty string.
 */
export function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    return process.env[name] ?? '';
  });
}

/**
 * Validate a raw config file object. Throws descriptive errors when
 * validation rules are violated.
 */
export function validateConfigFile(config: NanoclawConfigFile): void {
  const providerNames = Object.keys(config.providers);

  if (providerNames.length === 0) {
    throw new Error('Config must define at least one provider');
  }

  for (const [name, def] of Object.entries(config.providers)) {
    if (def.type !== 'local' && !def.apiKey) {
      throw new Error(`Provider "${name}" (${def.type}) requires an apiKey`);
    }

    if (def.type === 'openai' && !def.model) {
      throw new Error(`Provider "${name}" (openai) requires a model`);
    }
  }

  if (config.edge?.provider) {
    if (!(config.edge.provider in config.providers)) {
      throw new Error(
        `edge.provider "${config.edge.provider}" does not match any defined provider`,
      );
    }
  }

  if (config.container?.provider) {
    if (!(config.container.provider in config.providers)) {
      throw new Error(
        `container.provider "${config.container.provider}" does not match any defined provider`,
      );
    }

    const containerType = config.providers[config.container.provider].type;
    if (containerType !== 'anthropic') {
      throw new Error(
        `container.provider must be of type "anthropic", got "${containerType}"`,
      );
    }
  }
}

/**
 * Fully resolve a config file: validate, expand env vars, apply defaults,
 * and resolve provider references.
 */
export function resolveConfig(
  config: NanoclawConfigFile,
): ResolvedNanoclawConfig {
  validateConfigFile(config);

  // Resolve all providers with expanded env vars.
  const resolvedProviders: Record<string, ResolvedProvider> = {};
  for (const [name, def] of Object.entries(config.providers)) {
    resolvedProviders[name] = {
      name,
      type: def.type,
      apiKey: def.apiKey ? expandEnvVars(def.apiKey) : undefined,
      baseUrl: def.baseUrl ? expandEnvVars(def.baseUrl) : undefined,
      model: def.model ?? undefined,
    };
  }

  // Find the first anthropic provider for default edge/container resolution.
  const firstAnthropic = Object.entries(resolvedProviders).find(
    ([, p]) => p.type === 'anthropic',
  );

  const edgeProviderName = config.edge?.provider ?? firstAnthropic?.[0];
  if (!edgeProviderName || !(edgeProviderName in resolvedProviders)) {
    throw new Error('No anthropic provider available for edge');
  }

  const containerProviderName =
    config.container?.provider ?? firstAnthropic?.[0];
  if (!containerProviderName || !(containerProviderName in resolvedProviders)) {
    throw new Error('No anthropic provider available for container');
  }

  return {
    profile: config.profile ?? 'terminal',
    executionMode: config.executionMode ?? 'edge',
    edgeRunnerMode: config.edgeRunnerMode ?? 'edgejs',
    providers: resolvedProviders,
    edgeProvider: resolvedProviders[edgeProviderName],
    containerProvider: resolvedProviders[containerProviderName],
    edge: {
      enableTools: config.edge?.enableTools ?? true,
      disableFallback: config.edge?.disableFallback ?? false,
    },
    container: {
      maxConcurrent: config.container?.maxConcurrent ?? 5,
    },
  };
}
