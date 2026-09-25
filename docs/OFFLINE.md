# Offline / self-contained operation

This fork can run with **no traffic leaving your machine or LAN**. Two layers do
it, and you should use both:

1. **Code layer: `JARVIS_OFFLINE=1`.** Every outbound path that upstream
   enables by default, plus every LLM/voice path, is refused at its chokepoint,
   with one log line saying why.
2. **Network layer: `docker-compose.offline.yml`.** Jarvis and Ollama sit on a
   Docker `internal` network with no gateway. Anything the code layer does not
   cover (see [What `JARVIS_OFFLINE` does *not* cover](#what-jarvis_offline-does-not-cover)) has nowhere to go.

The code layer is the part you can read and test. The network layer is the
part you can trust even if the code missed something.

## Quick start: Docker (recommended)

The stack in `docker-compose.offline.yml`, sized for one 16 GB NVIDIA GPU:

| Service | Role | Model |
| --- | --- | --- |
| `ollama` | LLM, OpenAI-compatible `/v1` | `qwen2.5:7b-instruct` |
| `speaches` | STT `/v1/audio/transcriptions` (faster-whisper) | `mobiuslabsgmbh/faster-whisper-large-v3-turbo` |
| `speaches` | TTS `/v1/audio/speech` (Kokoro) | `speaches-ai/Kokoro-82M-v1.0-ONNX`, voice `af_heart` |
| `jarvis` | The brain + dashboard | |
| `edge` | TCP relay, the only published port (`127.0.0.1:3142`) | |

Host prerequisites: Docker with Compose v2, an NVIDIA driver of the R570
branch or newer (required for RTX 50-series), and the NVIDIA Container
Toolkit (`nvidia-ctk runtime configure --runtime=docker`).

```bash
scripts/offline/setup.sh   # ONLINE, once: images, build, all three models; then starts + tests
scripts/offline/test.sh    # OFFLINE, any time: re-run the checks
open http://127.0.0.1:3142
```

`setup.sh` is the only step that needs internet. It creates `.env` from
`.env.example` if missing, pulls the images, builds Jarvis, downloads the LLM
(`ollama-pull`) and the STT/TTS models (`speaches-pull`, through Speaches' own
download API, then checks that Speaches recognises each model), and then
starts the runtime services on the internal network.

`test.sh` checks, in order:

1. `ollama` and `speaches` are healthy, and the dashboard answers.
2. `jarvis`, `ollama` and `speaches` each **fail** to open an internet connection.
3. The LLM answers at the URL Jarvis uses, and `ollama ps` shows the context window.
4. TTS through Jarvis's own `LocalOpenAITTS` adapter (`/api/tts/preview`),
   saved to `test-output/tts-preview.mp3`.
5. The full voice loop over the dashboard WebSocket. A spoken WAV is made
   locally, Jarvis transcribes it with its `LocalWhisperSTT` adapter, the LLM
   answers, and Kokoro speaks the reply back.
6. VRAM in use.

The dashboard opens without a login because `docker/offline/config.yaml` sets
`auth.insecure_open_access: true`. That is safe **only** because the port is
published on `127.0.0.1`. Anyone who can reach the port controls Jarvis, and
Jarvis can run commands. Do not change the binding to `0.0.0.0` without
removing that flag and enrolling a device (`jarvis enroll`, see
[SELF_HOSTING.md](SELF_HOSTING.md)).

### Why these settings (GPU / Blackwell)

- **`OLLAMA_CONTEXT_LENGTH=32768`.** Jarvis's first chat turn is about 61k
  characters (~15k tokens): 41k of tool schemas plus the system prompt,
  measured on this fork. Ollama's default window is 4096, and the
  OpenAI-compatible endpoint Jarvis uses cannot raise it per request. Without
  this setting the prompt is **silently truncated**. 32768 is Qwen2.5-7B's
  native maximum.
- **`OLLAMA_NUM_PARALLEL=2`.** Each spoken turn sends two different large
  prompts: the voice-intent classifier (~42k characters) and then the chat
  turn. With one slot they evict each other's cached prefix. This setting is
  reasoned, not benchmarked. Set it to 1 to save ~0.9 GB if latency is fine.
- **`OLLAMA_KV_CACHE_TYPE=q8_0` + flash attention.** Halves KV-cache VRAM.
- **`WHISPER__COMPUTE_TYPE=float16`.** On RTX 50-series (sm_120),
  CTranslate2's default int8 path fails with `CUBLAS_STATUS_NOT_SUPPORTED`,
  and float16 works. The newest Speaches CUDA image is built on CUDA 12.6.3,
  which predates Blackwell. If STT still fails on the GPU, set
  `WHISPER_DEVICE=cpu` and `WHISPER_COMPUTE_TYPE=int8` in `.env`. Turbo on
  CPU is slower but works.
- **`*_MODEL_TTL=-1`, `OLLAMA_KEEP_ALIVE=-1`.** Models stay loaded, so there
  is no reload pause on the first word after idle.

Rough VRAM budget. These are **estimates** from model sizes, not
measurements; `test.sh` step 6 prints the real number.

| Component | Approx. VRAM |
| --- | --- |
| Qwen2.5-7B Q4_K_M weights | ~4.7 GB |
| KV cache, 32k × 2 slots, q8_0 | ~1.9 GB |
| Ollama compute buffers | ~0.5–1 GB |
| Whisper large-v3-turbo, float16 | ~1.6–2.5 GB |
| Kokoro-82M (ONNX) | < 0.5 GB |
| **Total** | **~9–10.5 GB of 16 GB** |

### Language: Kokoro has no Turkish voice

Kokoro v1.0 speaks English, Spanish, French, Hindi, Italian, Japanese,
Brazilian Portuguese and Mandarin. If you talk to Jarvis in Turkish, Whisper
will transcribe it fine and Qwen will answer in Turkish, but Kokoro will read
that answer with English pronunciation. For Turkish speech, pick a TTS model
with a `tr_TR` voice. Speaches also runs Piper, which has Turkish voices. To
list what Speaches can install, start a throwaway online instance and query its
registry:

```bash
docker run --rm -d --name speaches-registry -p 127.0.0.1:8001:8000 ghcr.io/speaches-ai/speaches:latest-cpu
curl -s 'http://127.0.0.1:8001/v1/registry?task=text-to-speech' | grep -o '"id":"[^"]*tr_TR[^"]*"'
docker stop speaches-registry
```

Then set `JARVIS_TTS_MODEL` / `JARVIS_TTS_VOICE` in `.env` and re-run
`setup.sh`. Nothing else changes, because Jarvis only sees the OpenAI-style
`/v1/audio/speech` endpoint.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| `speaches-pull`: "downloaded but NOT recognised" for the Whisper model | Set `JARVIS_STT_MODEL=deepdml/faster-whisper-large-v3-turbo-ct2` and re-run `setup.sh`. Speaches only lists repos whose model card says `library_name: ctranslate2`. |
| STT fails, `CUBLAS_STATUS_NOT_SUPPORTED` in `logs speaches` | Keep `WHISPER_COMPUTE_TYPE=float16`; else fall back to CPU (above). |
| `ollama ps` shows `PROCESSOR` partly CPU | VRAM ran out: lower `OLLAMA_CONTEXT_LENGTH` (not below 16384) or `OLLAMA_NUM_PARALLEL=1`. |
| Replies ignore tools or the persona | Context truncated: check `CONTEXT` in `ollama ps`. |
| `could not select device driver "nvidia"` | NVIDIA Container Toolkit not installed / Docker not restarted. |

## Quick start: bare metal

```bash
# Local inference server, e.g. Ollama
ollama pull qwen2.5:7b-instruct          # ONLINE, once
ollama serve                             # http://localhost:11434

bun install                              # ONLINE, once
cp .env.example .env                     # defaults already point at localhost:11434/v1

# ONLINE, once: prebuild the workflow engine, otherwise the daemon runs
# `bun install` against npm on first boot.
bun run scripts/build-shared-runtime.ts --out ~/.jarvis/runtime --pieces 0
cat >> ~/.jarvis/config.yaml <<EOF
workflows:
  engine_dir: $HOME/.jarvis/runtime/engine
  pieces_dir: $HOME/.jarvis/runtime/pieces
  piece_metadata_cache: $HOME/.jarvis/runtime/piece-metadata.json
EOF

bun run build:ui                         # dashboard bundle
bun run start                            # Bun loads .env from the repo root
```

The dashboard is JWT-only by default. For a single-user machine, either enroll
the desktop sidecar (`jarvis enroll "my-desktop"`, then start the sidecar with
`--token <token>`, which also skips its hosted-onboarding window), or set
`auth.insecure_open_access: true` in `~/.jarvis/config.yaml` while the daemon
is reachable only from localhost.

Bare metal has **no network layer** unless you add one (a firewall rule, a
network namespace, or `unshare -n` plus a local veth). Treat `JARVIS_OFFLINE`
alone as best-effort.

## Configuration reference

All variables are read on boot and re-applied on every settings reload
(`SIGHUP`, dashboard save). Env wins over the dashboard for every slot it sets.

### Isolation

| Variable | Effect |
| --- | --- |
| `JARVIS_OFFLINE=1` | Master switch (below). |
| `JARVIS_OFFLINE_ALLOW_HOSTS` | Extra hosts treated as local (exact, comma separated). |

"Local" means loopback, RFC 1918, CGNAT/Tailscale `100.64/10`, IPv6 ULA and
link-local addresses, single-label names (`ollama`), and `*.local`, `*.lan`,
`*.internal`, `*.home.arpa`.

### LLM

| Variable | Example | Notes |
| --- | --- | --- |
| `JARVIS_LLM_BASE_URL` | `http://localhost:11434/v1` | Required; enables the `env` provider. |
| `JARVIS_LLM_MODEL` | `qwen2.5:7b-instruct` | Single-LLM default. With the base URL, it also satisfies the first-run setup gate. |
| `JARVIS_LLM_KIND` | `openai_compatible` | Or `ollama` (native API), `litellm`, `omniroute`. |
| `JARVIS_LLM_API_KEY` | | Only if your server needs one. |
| `JARVIS_LLM_MODEL_{LOW,MEDIUM,HIGH,CONVERSATION}` | | Optional per-tier models. |

The provider appears in the dashboard as `env` and is read-only there. It and
the model refs pointing at it are **never written to the database**, so
removing the variables restores whatever the dashboard had.

Model choice matters more than any setting here. Jarvis sends about 50 tool
schemas per turn, so small models that are weak at function calling will
struggle. Screen awareness sends screenshots to the `low` tier, so point that
tier at a vision model (e.g. `qwen2.5vl:7b`) or expect those calls to fail
harmlessly.

### Voice (optional)

Without these, voice is off in offline mode and the dashboard is text-only.
[Speaches](https://speaches.ai) serves both STT and TTS from one container;
whisper.cpp's server and Kokoro-FastAPI work too.

| Variable | Example |
| --- | --- |
| `JARVIS_STT_PROVIDER` | `local` |
| `JARVIS_STT_URL` | `http://localhost:8000/v1` |
| `JARVIS_STT_SERVER_TYPE` | `openai_compatible` or `whisper_cpp` |
| `JARVIS_STT_MODEL` | `Systran/faster-whisper-small` |
| `JARVIS_STT_LANGUAGE` | `tr` |
| `JARVIS_TTS_PROVIDER` | `local` or `none` |
| `JARVIS_TTS_URL` | `http://localhost:8880/v1` |
| `JARVIS_TTS_MODEL` | `kokoro` |
| `JARVIS_TTS_VOICE` | `af_heart` |

The wake word ("Hey Jarvis") runs in the browser from bundled ONNX models
(openwakeword) and needs no server.

## Network inventory

What upstream v0.14.0 contacts, and what this fork does about it.

### On by default upstream

| Destination | Trigger | This fork |
| --- | --- | --- |
| `*.supabase.co` (brain telemetry) | Boot + hourly | Endpoint and key **removed**; opt-in, and only to a collector you configure. |
| `*.supabase.co` (sidecar telemetry) | Sidecar start + hourly | Same; also honors `JARVIS_OFFLINE` / `DO_NOT_TRACK`. |
| `registry.npmjs.org` | First boot: workflow engine `bun install` | Prebuilt at image build (Docker) or once by hand (bare metal). |
| `fonts.googleapis.com`, `fonts.gstatic.com` | Every dashboard page load (browser) | Links removed; system fonts. |
| Microsoft Edge TTS | TTS on, no provider chosen (default `edge`) | Refused offline; use `JARVIS_TTS_PROVIDER=local`. |

### Opt-in or conditional upstream

| Destination | Trigger | Under `JARVIS_OFFLINE` |
| --- | --- | --- |
| `llm.usejarvis.host` + billing/usage control plane | Provisioner-written `usejarvis_ai` / `usejarvis_billing` blocks | Blocks ignored. |
| OpenAI / Anthropic / Groq / Gemini / OpenRouter / NVIDIA | Provider configured in dashboard | Not instantiated; only local `base_url`s are allowed. |
| Groq / NVIDIA model-list routes | Dashboard provider picker | Refused. |
| OpenAI / Groq / Sarvam STT, ElevenLabs / Sarvam TTS | Configured in dashboard | Refused. |
| `wss://api.openai.com/v1/realtime` | `voice.realtime.enabled` | Forced off. |
| Browser Web Speech (Google) | `wake_engine: webspeech` / `auto` | Forced to `openwakeword`. |

### What `JARVIS_OFFLINE` does *not* cover

These are features you have to configure or ask for explicitly. They are left
alone because refusing them in code would break them silently. The Docker
internal network stops all of them.

- **Channels:** Telegram, Discord, WhatsApp, Signal (off unless configured).
- **Google:** Gmail / Calendar (only after OAuth setup).
- **Site builder → GitHub:** push to a repo you connect.
- **Workflow pieces:** installing a piece runs `bun install` against npm; pieces
  that call SaaS APIs do so when a workflow runs.
- **Agent tools:** web browsing and HTTP tools reach the internet when the
  agent uses them.
- **`jarvis update`:** git / npm.
- **Sidecar:** its first-run window opens the hosted connect page
  (`app.usejarvis.dev`) unless you start it with `--token`; the tray's
  "Account" item opens that site in your browser.
- **Dashboard links:** "status" / "support" / "pricing" in error states open
  `usejarvis.com` in a new tab, but only when clicked.

## How this was verified

- Unit tests: `src/config/offline.test.ts`, `src/daemon/env-llm.test.ts`,
  `src/comms/voice-offline.test.ts`, `src/telemetry/*.test.ts`.
- End to end (bare metal): the daemon ran with `JARVIS_OFFLINE=1`, its
  `HTTP(S)_PROXY` pointed at a tripwire that logs every connection attempt,
  and the LLM pointed at a fake OpenAI-compatible server on `127.0.0.1:11434`.
  A dashboard WebSocket chat was answered by the local model. With the
  prebuilt workflow runtime, the tripwire logged **zero** outbound attempts
  across boot, the chat, and idle background work. Without it, it logged
  the npm `bun install`, which is how that dependency was found.
- Voice loop (bare metal): the daemon ran with a fake Speaches (fixed
  transcript, placeholder audio) and the fake LLM. The exact JavaScript from
  `scripts/offline/test.sh` steps 3 and 5 passed against it: WAV into Jarvis's
  `LocalWhisperSTT`, then the LLM, then `LocalOpenAITTS`, with audio returned
  over the WebSocket. `/api/tts/preview` (step 4) returned the local server's
  audio.
- Not verified here: the Docker stack itself and real model quality or
  latency (no Docker daemon or GPU was available; the compose file was
  validated with `docker compose config`), and the Go sidecar build (needs
  GTK/WebKit headers; the change was type-checked in isolation).
