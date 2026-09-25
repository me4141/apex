/**
 * Offline / self-contained mode (fork addition, not in upstream Jarvis).
 *
 * `JARVIS_OFFLINE=1` turns the daemon into a closed box: every outbound path
 * that would leave the machine or the local network is refused at its single
 * chokepoint (LLM provider instantiation, STT/TTS factories, realtime voice,
 * telemetry, the hosted usejarvis blocks). Anything that is refused logs one
 * line saying why, so a missing feature is never a silent mystery.
 *
 * "Local" means an http(s) URL whose host is loopback, an RFC 1918 / ULA /
 * link-local address, a single-label name (docker-compose service names such
 * as `ollama`), `*.local` / `*.internal` / `*.lan` / `*.home.arpa`, or a host
 * listed in `JARVIS_OFFLINE_ALLOW_HOSTS` (comma separated, exact match).
 */

type Env = NodeJS.ProcessEnv;

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const s = value.trim().toLowerCase();
  return !(s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off');
}

export function isOfflineMode(env: Env = process.env): boolean {
  return isTruthy(env.JARVIS_OFFLINE);
}

function allowedHosts(env: Env): Set<string> {
  return new Set(
    (env.JARVIS_OFFLINE_ALLOW_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // CGNAT / Tailscale
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1') return true;
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (v4) return isPrivateIPv4(v4[1]!);
  return /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
}

export function isLocalHost(hostname: string, env: Env = process.env): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (allowedHosts(env).has(host)) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return true;
  if (/^[a-z0-9-]+$/.test(host) && !/^\d+$/.test(host)) return true; // single-label
  return /\.(local|internal|lan|home\.arpa)$/.test(host);
}

/** True for an http(s)/ws(s) URL that points at a local host (see above). */
export function isLocalUrl(raw: string | undefined, env: Env = process.env): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw.trim());
    if (!/^(https?|wss?):$/.test(url.protocol)) return false;
    return isLocalHost(url.hostname, env);
  } catch {
    return false;
  }
}

const warned = new Set<string>();

/** Log a refusal once per distinct message (factories run on every reload). */
export function warnOfflineBlocked(what: string, detail?: string): void {
  const line = `[Offline] Blocked ${what}${detail ? ` (${detail})` : ''} - JARVIS_OFFLINE is set`;
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(line);
}
