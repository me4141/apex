import { afterEach, describe, expect, test } from 'bun:test';
import { createSTTProvider, createTTSProvider, LocalOpenAITTS, LocalWhisperSTT } from './voice.ts';

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
