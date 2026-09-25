import { afterEach, describe, expect, test } from 'bun:test';
import { createSTTProvider, createTTSProvider, LocalOpenAITTS, LocalWhisperSTT } from './voice.ts';
import { createApiRoutes, type ApiContext } from '../daemon/api-routes.ts';
import { DEFAULT_CONFIG } from '../config/types.ts';

const prev = process.env.JARVIS_OFFLINE;
afterEach(() => {
  if (prev === undefined) delete process.env.JARVIS_OFFLINE;
  else process.env.JARVIS_OFFLINE = prev;
});

describe('voice factories in offline mode', () => {
  test('STT: only a local whisper endpoint is built', () => {
    process.env.JARVIS_OFFLINE = '1';
    expect(createSTTProvider({ provider: 'openai', openai: { api_key: 'sk' } })).toBeNull();
    expect(createSTTProvider({ provider: 'groq', groq: { api_key: 'gsk' } })).toBeNull();
    expect(createSTTProvider({ provider: 'usejarvis' }, { baseUrl: 'https://llm.usejarvis.host', apiKey: 'k' })).toBeNull();
    expect(createSTTProvider({ provider: 'local', local: { endpoint: 'https://whisper.example.com' } })).toBeNull();
    expect(createSTTProvider({ provider: 'local' })).toBeInstanceOf(LocalWhisperSTT);
    expect(createSTTProvider({ provider: 'local', local: { endpoint: 'http://whisper:8000/v1' } })).toBeInstanceOf(LocalWhisperSTT);
  });

  test('TTS: edge (the upstream default) and all cloud providers are refused', () => {
    process.env.JARVIS_OFFLINE = '1';
    expect(createTTSProvider({ enabled: true })).toBeNull();
    expect(createTTSProvider({ enabled: true, provider: 'edge' })).toBeNull();
    expect(createTTSProvider({ enabled: true, provider: 'elevenlabs', elevenlabs: { api_key: 'k' } })).toBeNull();
    expect(createTTSProvider({ enabled: true, provider: 'local', local: { base_url: 'https://tts.example.com' } })).toBeNull();
    expect(createTTSProvider({ enabled: true, provider: 'local' })).toBeInstanceOf(LocalOpenAITTS);
  });

  test('online behaviour is unchanged', () => {
    expect(createSTTProvider({ provider: 'openai', openai: { api_key: 'sk' } })).not.toBeNull();
    expect(createTTSProvider({ enabled: true })).not.toBeNull(); // edge
  });
});

describe('LocalOpenAITTS', () => {
  test('posts an OpenAI speech request to /v1/audio/speech and returns the audio', async () => {
    let seen: { path: string; body: unknown; auth: string | null } | null = null;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        seen = { path: new URL(req.url).pathname, body: await req.json(), auth: req.headers.get('authorization') };
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { headers: { 'content-type': 'audio/mpeg' } });
      },
    });
    try {
      const tts = new LocalOpenAITTS(`http://127.0.0.1:${server.port}`, 'kokoro', 'af_heart');
      const audio = await tts.synthesize('Merhaba.');
      expect([...audio]).toEqual([0xff, 0xfb, 0x90, 0x00]);
      expect(seen!).toEqual({
        path: '/v1/audio/speech',
        body: { model: 'kokoro', input: 'Merhaba.', voice: 'af_heart', response_format: 'mp3' },
        auth: null,
      });
    } finally {
      server.stop(true);
    }
  });

  test('surfaces server errors', async () => {
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('no such voice', { status: 400 }) });
    try {
      const tts = new LocalOpenAITTS(`http://127.0.0.1:${server.port}/v1`);
      await expect(tts.synthesize('x')).rejects.toThrow(/Local TTS error \(400\): no such voice/);
    } finally {
      server.stop(true);
    }
  });
});

describe('/api/tts/preview with local TTS', () => {
  test('offline: previews through the configured local server instead of Edge', async () => {
    process.env.JARVIS_OFFLINE = '1';
    let seenVoice = '';
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        seenVoice = ((await req.json()) as { voice: string }).voice;
        return new Response(new Uint8Array([0xff, 0xfb]), { headers: { 'content-type': 'audio/mpeg' } });
      },
    });
    try {
      const config = structuredClone(DEFAULT_CONFIG);
      config.tts = { enabled: true, provider: 'local', local: { base_url: `http://127.0.0.1:${server.port}/v1`, voice: 'af_heart' } };
      const route = createApiRoutes({ config } as unknown as ApiContext)['/api/tts/preview'] as {
        POST: (req: Request) => Promise<Response>;
      };
      const post = (body: object) => route.POST(new Request('http://x/api/tts/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }));

      const res = await post({ text: 'Hello.' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
      expect(seenVoice).toBe('af_heart');

      await post({ provider: 'local', voice: 'bf_emma' });
      expect(seenVoice).toBe('bf_emma');
    } finally {
      server.stop(true);
    }
  });
});
