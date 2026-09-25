#!/usr/bin/env bash
# One-time setup for the offline stack (docs/OFFLINE.md).
#
# Needs internet ONCE: pulls images, builds Jarvis, downloads the LLM and the
# STT/TTS models into Docker volumes. Then starts everything on the internal
# (no-egress) network and runs scripts/offline/test.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."
DC=(docker compose -f docker-compose.offline.yml)

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
warn() { printf '\033[33mWARN:\033[0m %s\n' "$*"; }

step "Prerequisites"
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker compose version >/dev/null || { echo "docker compose v2 not found"; exit 1; }
if command -v nvidia-smi >/dev/null; then
  nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
  drv=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1 | cut -d. -f1)
  # RTX 50-series (Blackwell) needs the R570+ driver branch.
  [ "${drv:-0}" -ge 570 ] || warn "driver $drv < 570: RTX 50-series GPUs need R570 or newer"
else
  warn "nvidia-smi not found on the host: GPU services will fail to start"
fi
docker info --format '{{json .Runtimes}}' | grep -q nvidia \
  || warn "Docker has no 'nvidia' runtime: install the NVIDIA Container Toolkit (nvidia-ctk runtime configure --runtime=docker)"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

step "Pull images + build Jarvis (online)"
"${DC[@]}" --profile setup pull --ignore-buildable
"${DC[@]}" build jarvis

step "Download LLM (online)"
"${DC[@]}" --profile setup run --rm ollama-pull

step "Download STT + TTS models (online)"
"${DC[@]}" --profile setup run --rm speaches-pull

step "Start the stack on the internal network (offline from here on)"
"${DC[@]}" up -d
"${DC[@]}" ps

step "Tests"
exec scripts/offline/test.sh
