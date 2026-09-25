import type { JarvisConfig } from '../config/types.ts';
import { isOfflineMode } from '../config/offline.ts';

export type TelemetryDecision = {
  enabled: boolean;
  reason: string;
};

/** Treat unset/empty/0/false/no/off as "not enabled". */
function isFalsy(value: string): boolean {
  const s = value.trim().toLowerCase();
  return s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off';
}

export function resolveTelemetryEnabled(
  config: Pick<JarvisConfig, 'telemetry'>,
  env: NodeJS.ProcessEnv = process.env,
): TelemetryDecision {
  if (isOfflineMode(env)) {
    return { enabled: false, reason: 'JARVIS_OFFLINE is set' };
  }

  const dnt = env.DO_NOT_TRACK;
  if (dnt !== undefined && !isFalsy(dnt)) {
    return { enabled: false, reason: 'DO_NOT_TRACK is set' };
  }

  if (env.JARVIS_TELEMETRY !== undefined) {
    if (isFalsy(env.JARVIS_TELEMETRY)) {
      return { enabled: false, reason: 'JARVIS_TELEMETRY opt-out' };
    }
    return { enabled: true, reason: 'JARVIS_TELEMETRY opt-in' };
  }

  if (config.telemetry?.enabled === true) {
    return { enabled: true, reason: 'telemetry.enabled=true in config' };
  }

  // Fork change: opt-IN. Upstream defaulted to on.
  return { enabled: false, reason: 'telemetry.enabled=false in config (default)' };
}
