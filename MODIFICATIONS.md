# Modification notice

This is a **modified version** of J.A.R.V.I.S. by Vieri Balboni
(<https://github.com/vierisid/jarvis>), based on upstream release **v0.14.0**
(commit `e610c9b`). It is distributed under the unchanged
[Jarvis Source Available License 2.0](LICENSE), as section 6 of that license
requires. It is not endorsed by or affiliated with the Licensor.

## What was changed, and why

Purpose: run Jarvis fully self-hosted and offline against local inference
servers. Details and the network inventory are in [docs/OFFLINE.md](docs/OFFLINE.md).

| Area | Change |
| --- | --- |
| Telemetry (brain) | Built-in Supabase collector URL + key removed; telemetry is opt-in and needs your own `JARVIS_TELEMETRY_URL`/`_KEY`. |
| Telemetry (sidecar) | Same: collector removed; honors `JARVIS_OFFLINE` / `DO_NOT_TRACK`. |
| Offline mode | New `JARVIS_OFFLINE=1`: refuses non-local LLM/STT/TTS/realtime endpoints and ignores hosted `usejarvis_ai` / `usejarvis_billing` blocks. |
| LLM | New `JARVIS_LLM_*` env vars configure a local OpenAI-compatible provider (Ollama, vLLM, LM Studio, llama.cpp). |
| Voice | New local TTS provider (OpenAI-compatible `/v1/audio/speech`); `JARVIS_STT_*` / `JARVIS_TTS_*` env vars. |
| Dashboard | Google Fonts links removed (system font fallback). |
| Docker | Workflow engine prebuilt at image build; `LICENSE` shipped in the image; `docker-compose.offline.yml` with an internal (no-egress) network. |
| CI | All upstream GitHub Actions workflows removed (`.github/workflows`). |
