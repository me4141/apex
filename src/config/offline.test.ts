import { afterEach, describe, expect, test } from 'bun:test';
import { isLocalHost, isLocalUrl, isOfflineMode } from './offline.ts';
import { applyEnvOverrides } from './loader.ts';
import { DEFAULT_CONFIG, type JarvisConfig } from './types.ts';
import { resolveRealtimeVoice } from './realtime.ts';

const ENV_KEYS = [
  'JARVIS_OFFLINE', 'JARVIS_STT_PROVIDER', 'JARVIS_STT_URL', 'JARVIS_STT_MODEL', 'JARVIS_STT_SERVER_TYPE',
  'JARVIS_STT_LANGUAGE', 'JARVIS_TTS_PROVIDER', 'JARVIS_TTS_URL', 'JARVIS_TTS_MODEL', 'JARVIS_TTS_VOICE',
  'JARVIS_WAKE_ENGINE', 'JARVIS_LLM_BASE_URL', 'JARVIS_LLM_MODEL',
];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isOfflineMode', () => {
  test('truthy values only', () => {
    expect(isOfflineMode({})).toBe(false);
    for (const v of ['', '0', 'false', 'no', 'off']) expect(isOfflineMode({ JARVIS_OFFLINE: v })).toBe(false);
    for (const v of ['1', 'true', 'yes', 'on']) expect(isOfflineMode({ JARVIS_OFFLINE: v })).toBe(true);
  });
});

describe('isLocalUrl', () => {
  test.each([
    'http://localhost:11434/v1',
    'http://127.0.0.1:8080',
    'http://[::1]:8000/v1',
    'http://10.1.2.3/v1',
    'http://172.20.0.5:8880',
    'http://192.168.1.10:11434',
    'http://100.100.53.74:11434', // tailscale
    'http://ollama:11434/v1', // docker-compose service name
    'http://gpu-box.local:8000',
    'http://llm.lan/v1',
    'http://host.docker.internal:11434',
    'ws://localhost:3142',
  ])('local: %s', (url) => expect(isLocalUrl(url, {})).toBe(true));

  test.each([
    'https://api.openai.com/v1',
    'https://llm.usejarvis.host/v1',
    'http://8.8.8.8',
    'http://172.32.0.1', // just outside 172.16/12
    'http://11.0.0.1',
    'ftp://localhost',
    'not a url',
    '',
    undefined,
  ])('not local: %s', (url) => expect(isLocalUrl(url as string, {})).toBe(false));

  test('JARVIS_OFFLINE_ALLOW_HOSTS adds exact hosts', () => {
    expect(isLocalHost('llm.mycorp.example', {})).toBe(false);
    expect(isLocalHost('llm.mycorp.example', { JARVIS_OFFLINE_ALLOW_HOSTS: 'a.example, llm.mycorp.example' })).toBe(true);
  });
});

function freshConfig(): JarvisConfig {
  return structuredClone(DEFAULT_CONFIG);
}

describe('applyEnvOverrides: voice + offline', () => {
  test('JARVIS_STT_* configures local whisper', () => {
    process.env.JARVIS_STT_PROVIDER = 'local';
    process.env.JARVIS_STT_URL = 'http://localhost:8000/v1';
    process.env.JARVIS_STT_SERVER_TYPE = 'openai_compatible';
    process.env.JARVIS_STT_MODEL = 'Systran/faster-whisper-small';
    process.env.JARVIS_STT_LANGUAGE = 'tr';
    const cfg = freshConfig();
    applyEnvOverrides(cfg);
    expect(cfg.stt).toEqual({
      provider: 'local',
      language: 'tr',
      local: { endpoint: 'http://localhost:8000/v1', model: 'Systran/faster-whisper-small', server_type: 'openai_compatible' },
    });
  });

  test('JARVIS_TTS_PROVIDER=local enables local tts; none disables', () => {
    process.env.JARVIS_TTS_PROVIDER = 'local';
    process.env.JARVIS_TTS_URL = 'http://localhost:8880/v1';
    process.env.JARVIS_TTS_VOICE = 'af_bella';
    const cfg = freshConfig();
    applyEnvOverrides(cfg);
    expect(cfg.tts!.enabled).toBe(true);
    expect(cfg.tts!.provider).toBe('local');
    expect(cfg.tts!.local).toEqual({ base_url: 'http://localhost:8880/v1', voice: 'af_bella' });

    process.env.JARVIS_TTS_PROVIDER = 'none';
    applyEnvOverrides(cfg);
    expect(cfg.tts!.enabled).toBe(false);
  });

  test('offline forces openwakeword, realtime off, telemetry off', () => {
    process.env.JARVIS_OFFLINE = '1';
    process.env.JARVIS_WAKE_ENGINE = 'webspeech';
    const cfg = freshConfig();
    cfg.voice!.realtime = { enabled: true };
    cfg.telemetry = { enabled: true };
    applyEnvOverrides(cfg);
    expect(cfg.voice!.wake_engine).toBe('openwakeword');
    expect(cfg.voice!.realtime?.enabled).toBe(false);
    expect(cfg.telemetry?.enabled).toBe(false);
  });

  test('realtime resolution refuses offline even when enabled', () => {
    process.env.JARVIS_OFFLINE = '1';
    const cfg = freshConfig();
    cfg.llm.providers = { openai: { kind: 'openai', api_key: 'sk-test' } };
    const r = resolveRealtimeVoice(cfg, 'user-on');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toContain('JARVIS_OFFLINE');
  });

  test('env LLM satisfies the first-run gate (in memory), and only with a model', () => {
    const cfg = freshConfig();
    process.env.JARVIS_LLM_BASE_URL = 'http://localhost:11434/v1';
    applyEnvOverrides(cfg);
    expect(cfg.onboarding?.setup_completed_at ?? null).toBeNull();

    process.env.JARVIS_LLM_BASE_URL = 'localhost:11434'; // readEnvLlm ignores this
    process.env.JARVIS_LLM_MODEL = 'qwen2.5:7b-instruct';
    applyEnvOverrides(cfg);
    expect(cfg.onboarding?.setup_completed_at ?? null).toBeNull();
    process.env.JARVIS_LLM_BASE_URL = 'http://localhost:11434/v1';

    process.env.JARVIS_LLM_MODEL = 'qwen2.5:7b-instruct';
    applyEnvOverrides(cfg);
    expect(typeof cfg.onboarding?.setup_completed_at).toBe('number');

    // an existing completion time is never overwritten
    cfg.onboarding!.setup_completed_at = 42;
    applyEnvOverrides(cfg);
    expect(cfg.onboarding?.setup_completed_at).toBe(42);
  });
});
