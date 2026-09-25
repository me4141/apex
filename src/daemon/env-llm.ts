import type { JarvisConfig, LLMProviderEntry, LLMProviderKind, LLMTiersConfig } from '../config/types.ts';

/**
 * Env-configured LLM provider (fork addition, not in upstream Jarvis).
 *
 * Upstream reads LLM config ONLY from the dashboard (DB + keychain). For a
 * headless / offline deployment that means a browser round-trip before the
 * daemon can think. This lets a `.env` (or docker-compose `environment:`)
 * point the whole brain at a local OpenAI-compatible server:
 *
 *   JARVIS_LLM_BASE_URL=http://localhost:11434/v1   # required: enables it
 *   JARVIS_LLM_MODEL=qwen2.5:7b-instruct            # single-LLM default
 *   JARVIS_LLM_API_KEY=                             # optional (Ollama ignores it)
 *   JARVIS_LLM_KIND=openai_compatible               # or ollama | litellm | omniroute
 *   JARVIS_LLM_MODEL_LOW / _MEDIUM / _HIGH / _CONVERSATION   # optional per-tier models
 *
 * The provider is injected under the reserved name `env` on every LLM merge
 * (boot, SIGHUP, dashboard save), exactly like the hosted block, and is never
 * persisted. Env wins over the dashboard for every slot it sets - the same
 * precedence every other JARVIS_* override has. Slots the env leaves unset
 * keep whatever the dashboard chose.
 */

export const ENV_PROVIDER_NAME = 'env';

const ALLOWED_KINDS: ReadonlySet<LLMProviderKind> = new Set([
  'openai_compatible', 'ollama', 'litellm', 'omniroute',
]);

const TIER_ENV: ReadonlyArray<[keyof LLMTiersConfig, string]> = [
  ['conversation', 'JARVIS_LLM_MODEL_CONVERSATION'],
  ['high', 'JARVIS_LLM_MODEL_HIGH'],
  ['medium', 'JARVIS_LLM_MODEL_MEDIUM'],
  ['low', 'JARVIS_LLM_MODEL_LOW'],
];

export type EnvLlm = {
  entry: LLMProviderEntry;
  default?: string;
  tiers: LLMTiersConfig;
};

let invalidKindWarned = false;

/** Parse the env block. Null when JARVIS_LLM_BASE_URL is unset or not http(s). */
export function readEnvLlm(env: NodeJS.ProcessEnv = process.env): EnvLlm | null {
  const baseUrl = env.JARVIS_LLM_BASE_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) return null;
  if (!/^https?:\/\//i.test(baseUrl)) {
    console.warn(`[LLM] Ignoring JARVIS_LLM_BASE_URL="${baseUrl}" - must be an http(s) URL.`);
    return null;
  }

  let kind = (env.JARVIS_LLM_KIND?.trim() || 'openai_compatible') as LLMProviderKind;
  if (!ALLOWED_KINDS.has(kind)) {
    if (!invalidKindWarned) {
      invalidKindWarned = true;
      console.warn(`[LLM] Invalid JARVIS_LLM_KIND="${kind}" - using openai_compatible.`);
    }
    kind = 'openai_compatible';
  }
  // OllamaProvider speaks the native /api/* routes and wants the bare origin.
  const url = kind === 'ollama' ? baseUrl.replace(/\/v1$/, '') : baseUrl;
  const apiKey = env.JARVIS_LLM_API_KEY?.trim();

  const ref = (model: string | undefined) => {
    const m = model?.trim();
    return m ? `${ENV_PROVIDER_NAME}:${m}` : undefined;
  };
  const tiers: LLMTiersConfig = {};
  for (const [tier, key] of TIER_ENV) {
    const r = ref(env[key]);
    if (r) tiers[tier] = r;
  }

  return {
    entry: { kind, base_url: url, ...(apiKey ? { api_key: apiKey } : {}) },
    default: ref(env.JARVIS_LLM_MODEL),
    tiers,
  };
}

/**
 * Inject the env provider + its model refs into config.llm. Must run inside
 * mergeLLMSettingsIntoConfig BEFORE the orphan prune, so env refs are never
 * treated as dangling.
 */
export function applyEnvLlm(config: JarvisConfig, env: NodeJS.ProcessEnv = process.env): void {
  const parsed = readEnvLlm(env);
  if (!parsed) return;
  config.llm.providers ??= {};
  config.llm.tiers ??= {};
  config.llm.providers[ENV_PROVIDER_NAME] = parsed.entry;
  if (parsed.default) config.llm.default = parsed.default;
  Object.assign(config.llm.tiers, parsed.tiers);
}

export function hasEnvLlm(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEnvLlm(env) !== null;
}
