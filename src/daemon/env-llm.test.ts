import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDatabase, closeDb } from '../vault/schema.ts';
import { getSetting } from '../vault/settings.ts';
import { DEFAULT_CONFIG, type JarvisConfig } from '../config/types.ts';
import { mergeLLMSettingsIntoConfig, saveLLMSettings, testLLMProvider } from './llm-settings.ts';
import { readEnvLlm } from './env-llm.ts';
import { instantiateProvider, offlineProviderRefusal } from '../llm/config-binding.ts';

const ENV_KEYS = [
  'JARVIS_SECRETS_DIR', 'JARVIS_OFFLINE', 'JARVIS_LLM_BASE_URL', 'JARVIS_LLM_MODEL', 'JARVIS_LLM_API_KEY', 'JARVIS_LLM_KIND',
  'JARVIS_LLM_MODEL_LOW', 'JARVIS_LLM_MODEL_MEDIUM', 'JARVIS_LLM_MODEL_HIGH', 'JARVIS_LLM_MODEL_CONVERSATION',
];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function resetEnv() {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

function freshConfig(): JarvisConfig {
  return structuredClone(DEFAULT_CONFIG);
}

describe('readEnvLlm', () => {
  test('unset / non-http base url -> null', () => {
    expect(readEnvLlm({})).toBeNull();
    expect(readEnvLlm({ JARVIS_LLM_BASE_URL: 'localhost:11434' })).toBeNull();
  });

  test('defaults to openai_compatible and keeps /v1', () => {
    const r = readEnvLlm({
      JARVIS_LLM_BASE_URL: 'http://localhost:11434/v1/',
      JARVIS_LLM_MODEL: 'qwen2.5:7b-instruct',
      JARVIS_LLM_MODEL_HIGH: 'qwen2.5:32b',
    });
    expect(r).toEqual({
      entry: { kind: 'openai_compatible', base_url: 'http://localhost:11434/v1' },
      default: 'env:qwen2.5:7b-instruct',
      tiers: { high: 'env:qwen2.5:32b' },
    });
  });

  test('ollama kind strips /v1 (native API), invalid kind falls back', () => {
    expect(readEnvLlm({ JARVIS_LLM_BASE_URL: 'http://ollama:11434/v1', JARVIS_LLM_KIND: 'ollama' })?.entry)
      .toEqual({ kind: 'ollama', base_url: 'http://ollama:11434' });
    expect(readEnvLlm({ JARVIS_LLM_BASE_URL: 'http://x:1/v1', JARVIS_LLM_KIND: 'openai' })?.entry.kind)
      .toBe('openai_compatible');
  });
});

describe('env provider in the LLM merge', () => {
  let secretsDir = '';
  beforeEach(() => {
    secretsDir = mkdtempSync(join(tmpdir(), 'jarvis-env-llm-'));
    process.env.JARVIS_SECRETS_DIR = secretsDir;
    initDatabase(':memory:');
  });
  afterEach(() => {
    closeDb();
    resetEnv();
    rmSync(secretsDir, { recursive: true, force: true });
  });

  test('injects provider + default, env wins over the dashboard default', () => {
    const cfg = freshConfig();
    saveLLMSettings(cfg, {
      providers: { anthropic: { kind: 'anthropic', api_key: 'sk-ant-test' } },
      default: 'anthropic:claude-sonnet-4-6',
    });

    process.env.JARVIS_LLM_BASE_URL = 'http://localhost:11434/v1';
    process.env.JARVIS_LLM_MODEL = 'llama3.1:8b';
    mergeLLMSettingsIntoConfig(cfg);
    expect(cfg.llm.providers?.env).toEqual({ kind: 'openai_compatible', base_url: 'http://localhost:11434/v1' });
    expect(cfg.llm.default).toBe('env:llama3.1:8b');
    // the dashboard's own provider is still there
    expect(cfg.llm.providers?.anthropic).toBeDefined();
  });

  test('never persisted; unsetting env restores the dashboard choice', () => {
    const cfg = freshConfig();
    saveLLMSettings(cfg, {
      providers: { lan: { kind: 'openai_compatible', base_url: 'http://10.0.0.5:8000/v1' } },
      default: 'lan:mistral',
    });

    process.env.JARVIS_LLM_BASE_URL = 'http://localhost:11434/v1';
    process.env.JARVIS_LLM_MODEL = 'llama3.1:8b';
    process.env.JARVIS_LLM_API_KEY = 'secret-local-key';
    mergeLLMSettingsIntoConfig(cfg);
    // An unrelated dashboard save while env is active.
    saveLLMSettings(cfg, { prompt_cache: false });

    expect(getSetting('llm.providers') ?? '').not.toContain('"env"');
    expect(getSetting('llm.providers') ?? '').not.toContain('secret-local-key');
    expect(getSetting('llm.default')).toBe('lan:mistral');

    resetEnv();
    mergeLLMSettingsIntoConfig(cfg);
    expect(cfg.llm.providers?.env).toBeUndefined();
    expect(cfg.llm.default).toBe('lan:mistral');
  });

  test('a pre-existing dashboard provider named `env` survives saves while env is active', () => {
    const cfg = freshConfig();
    saveLLMSettings(cfg, { providers: { env: { kind: 'openai_compatible', base_url: 'http://10.0.0.9:8000/v1' } } });

    process.env.JARVIS_LLM_BASE_URL = 'http://localhost:11434/v1';
    mergeLLMSettingsIntoConfig(cfg);
    expect(cfg.llm.providers?.env?.base_url).toBe('http://localhost:11434/v1');
    saveLLMSettings(cfg, { prompt_cache: true });
    expect(JSON.parse(getSetting('llm.providers') ?? '{}').env?.base_url).toBe('http://10.0.0.9:8000/v1');

    resetEnv();
    process.env.JARVIS_SECRETS_DIR = secretsDir;
    mergeLLMSettingsIntoConfig(cfg);
    expect(cfg.llm.providers?.env?.base_url).toBe('http://10.0.0.9:8000/v1');
  });

  test('dashboard cannot edit the env provider', () => {
    process.env.JARVIS_LLM_BASE_URL = 'http://localhost:11434/v1';
    const cfg = freshConfig();
    mergeLLMSettingsIntoConfig(cfg);
    expect(() => saveLLMSettings(cfg, { providers: { env: { base_url: 'https://evil.example/v1' } } }))
      .toThrow(/JARVIS_LLM_/);
  });
});

describe('offline provider gate', () => {
  afterEach(resetEnv);

  test('online: nothing refused', () => {
    expect(offlineProviderRefusal('openai', { api_key: 'k' })).toBeNull();
  });

  test('offline: cloud kinds and remote base urls refused, local allowed', () => {
    process.env.JARVIS_OFFLINE = '1';
    for (const kind of ['openai', 'groq', 'gemini', 'openrouter', 'nvidia', 'usejarvis_ai'] as const) {
      expect(offlineProviderRefusal(kind, { api_key: 'k', base_url: 'http://localhost:1' })).toContain('vendor cloud');
      expect(instantiateProvider(kind, { kind, api_key: 'k', base_url: 'http://localhost:1' })).toBeNull();
    }
    expect(offlineProviderRefusal('anthropic', { api_key: 'k' })).toContain('no base_url');
    expect(offlineProviderRefusal('anthropic', { api_key: 'k', base_url: 'http://127.0.0.1:4000' })).toBeNull();
    expect(offlineProviderRefusal('openai_compatible', { base_url: 'https://api.together.xyz/v1' })).toContain('not a local host');
    expect(offlineProviderRefusal('omniroute', {})).toBeNull(); // implicit localhost default

    const p = instantiateProvider('local', { kind: 'openai_compatible', base_url: 'http://localhost:11434/v1' });
    expect(p?.name).toBe('local');
  });

  test('offline: dashboard "test connection" reports the real reason', async () => {
    initDatabase(':memory:');
    try {
      process.env.JARVIS_OFFLINE = '1';
      const r = await testLLMProvider({ name: 'groq', kind: 'groq', api_key: 'gsk_x' }, freshConfig());
      expect(r.ok).toBe(false);
      expect(r.error).toContain('JARVIS_OFFLINE');
    } finally {
      closeDb();
    }
  });
});
