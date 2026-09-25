/**
 * Fork change: upstream hard-coded its Supabase collector URL + anon key here.
 * Both are removed, so no build of this fork can reach the upstream collector.
 * A collector of your own can be supplied via env; with neither set there is
 * no endpoint and every send short-circuits as 'unconfigured'.
 */

/** 1 hour. Server processes that never restart still emit a heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

export function telemetryEndpoint(
  env: NodeJS.ProcessEnv = process.env,
): { url: string; key: string } | null {
  const url = env.JARVIS_TELEMETRY_URL?.trim() ?? '';
  const key = env.JARVIS_TELEMETRY_KEY?.trim() ?? '';
  if (!url || !key) return null;
  return { url, key };
}
