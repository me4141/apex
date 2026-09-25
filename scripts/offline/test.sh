#!/usr/bin/env bash
# Checks for the running offline stack. Needs no internet. Run any time:
#   scripts/offline/test.sh
# Writes sample audio to ./test-output/.
set -uo pipefail
cd "$(dirname "$0")/../.."
DC=(docker compose -f docker-compose.offline.yml)
OUT=test-output; mkdir -p "$OUT"
PASS=0; FAIL=0
ok()   { printf '\033[32mPASS\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '\033[31mFAIL\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
jexec() { "${DC[@]}" exec -T jarvis "$@"; }

step "1. Services up"
for svc in ollama speaches; do
  for _ in $(seq 1 60); do
    h=$(docker inspect -f '{{.State.Health.Status}}' "$("${DC[@]}" ps -q "$svc")" 2>/dev/null)
    [ "$h" = healthy ] && break; sleep 5
  done
  [ "$h" = healthy ] && ok "$svc healthy" || bad "$svc not healthy (status: ${h:-missing}); see: docker compose -f docker-compose.offline.yml logs $svc"
done
for _ in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:3142/api/health && break; sleep 2; done
curl -fsS -o /dev/null http://127.0.0.1:3142/api/health && ok "jarvis dashboard at http://127.0.0.1:3142" || bad "jarvis /api/health unreachable"

step "2. No internet from inside the stack (each must FAIL to connect)"
jexec bun -e "await fetch('https://example.com',{signal:AbortSignal.timeout(5000)})" >/dev/null 2>&1 \
  && bad "jarvis reached the internet" || ok "jarvis: no egress"
"${DC[@]}" exec -T ollama bash -c 'timeout 5 bash -c "</dev/tcp/1.1.1.1/443"' >/dev/null 2>&1 \
  && bad "ollama reached the internet" || ok "ollama: no egress"
"${DC[@]}" exec -T speaches python -c "import socket; socket.create_connection(('1.1.1.1',443),timeout=5)" >/dev/null 2>&1 \
  && bad "speaches reached the internet" || ok "speaches: no egress"

step "3. LLM (Ollama, via the URL Jarvis uses)"
jexec bun -e '
const t=Date.now();
const r=await fetch(process.env.JARVIS_LLM_BASE_URL+"/chat/completions",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({model:process.env.JARVIS_LLM_MODEL,messages:[{role:"user",content:"Reply with exactly one word: OK"}]})});
const j=await r.json().catch(()=>({}));
console.log(`model=${process.env.JARVIS_LLM_MODEL} status=${r.status} ${Date.now()-t}ms reply=${JSON.stringify(j.choices?.[0]?.message?.content??j)}`);
process.exit(r.ok?0:1);' && ok "LLM answered" || bad "LLM request failed"
echo "Loaded models (check CONTEXT >= 16384, PROCESSOR = 100% GPU):"
"${DC[@]}" exec -T ollama ollama ps

step "4. TTS through Jarvis's LocalOpenAITTS adapter (/api/tts/preview)"
code=$(curl -sS -o "$OUT/tts-preview.mp3" -w '%{http_code}' -X POST http://127.0.0.1:3142/api/tts/preview \
  -H 'content-type: application/json' -d '{"text":"Hello, I am Jarvis, running entirely on your machine."}')
size=$(wc -c < "$OUT/tts-preview.mp3")
[ "$code" = 200 ] && [ "$size" -gt 2000 ] && ok "TTS: $size bytes -> $OUT/tts-preview.mp3" \
  || bad "TTS preview HTTP $code, $size bytes: $(head -c 300 "$OUT/tts-preview.mp3")"

step "5. STT, then the full voice loop through Jarvis (WAV -> Whisper -> LLM -> Kokoro)"
jexec bun -e '
const sp="http://speaches:8000/v1", env=process.env, phrase="What is the capital of France?";
// A real spoken sample, produced locally by the TTS model.
let t=Date.now();
const r=await fetch(sp+"/audio/speech",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({model:env.JARVIS_TTS_MODEL,voice:env.JARVIS_TTS_VOICE,input:phrase,response_format:"wav"})});
if(!r.ok){console.log("FAIL sample wav",r.status,await r.text());process.exit(1)}
const wav=new Uint8Array(await r.arrayBuffer());
console.log(`sample wav ${wav.length} bytes (${Date.now()-t}ms)`);
// STT directly.
const fd=new FormData(); fd.append("file",new Blob([wav],{type:"audio/wav"}),"sample.wav"); fd.append("model",env.JARVIS_STT_MODEL);
t=Date.now(); const s=await fetch(sp+"/audio/transcriptions",{method:"POST",body:fd}); const st=await s.json().catch(()=>({}));
console.log(`STT (${Date.now()-t}ms): ${JSON.stringify(st.text??st)}`);
if(!s.ok||!/capital|france/i.test(st.text??"")){console.log("FAIL stt");process.exit(2)}
// Full loop over the dashboard WebSocket: Jarvis runs its own STT, the LLM, then TTS.
const ws=new WebSocket("ws://localhost:3142/ws",{headers:{Origin:"http://localhost:3142"}}); ws.binaryType="arraybuffer";
let transcript="", reply="", audio=0; t=Date.now();
const done=(code)=>{console.log(`voice loop (${Date.now()-t}ms): heard=${JSON.stringify(transcript)} reply=${JSON.stringify(reply.slice(0,160))} tts_bytes=${audio}`);process.exit(code)};
setTimeout(()=>{console.log("FAIL voice loop timeout");done(3)},180000);
ws.onopen=()=>{ws.send(JSON.stringify({type:"voice_start",payload:{requestId:"offline-test",mode:"wav"},timestamp:Date.now()}));
  ws.send(wav); ws.send(JSON.stringify({type:"voice_end",payload:{requestId:"offline-test"},timestamp:Date.now()}));};
ws.onmessage=(ev)=>{ if(typeof ev.data!=="string"){audio+=ev.data.byteLength;return}
  const m=JSON.parse(ev.data), p=m.payload??{};
  if(p.source==="voice_transcript") transcript=p.text;
  if(m.type==="stream"&&p.accumulated) reply=p.accumulated;
  if(m.type==="error"){console.log("daemon error:",JSON.stringify(p));done(4)}
  if(m.type==="tts_end"&&audio>0) done(transcript?0:5); };
' ; rc=$?
case $rc in
  0) ok "STT + full voice loop" ;;
  2) bad "STT did not recognise the sample (check WHISPER_COMPUTE_TYPE / logs speaches)" ;;
  *) bad "voice loop failed (exit $rc); see: docker compose -f docker-compose.offline.yml logs jarvis speaches" ;;
esac

step "6. VRAM"
command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader \
  || echo "(nvidia-smi not on host)"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
