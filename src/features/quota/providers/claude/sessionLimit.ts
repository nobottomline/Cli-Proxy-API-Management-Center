import type { ClaudeFiveHourLimit, ClaudeUsagePayload } from '@/types';

/** A missing/malformed window is unknown, never a reason to invent infinity. */
export function resolveClaudeFiveHourLimit(
  payload: ClaudeUsagePayload,
  planType: string | null
): ClaudeFiveHourLimit {
  const session = payload.five_hour;
  if (session && typeof session.utilization === 'number' && Number.isFinite(session.utilization)) {
    return 'limited';
  }
  const limits = payload.limits;
  const validLimits =
    Array.isArray(limits) &&
    limits.every((limit) => limit && typeof limit === 'object' && typeof limit.kind === 'string');
  const sessionDeclared =
    Array.isArray(limits) &&
    limits.some(
      (limit) =>
        (typeof limit?.kind === 'string' && limit.kind.startsWith('session')) ||
        limit?.group === 'session'
    );
  if (sessionDeclared) return 'limited';
  const weekly = payload.seven_day?.utilization;
  return planType === 'plan_max20' &&
    session === null &&
    typeof weekly === 'number' &&
    Number.isFinite(weekly) &&
    validLimits &&
    weekly >= 0 &&
    weekly <= 100
    ? 'uncapped'
    : 'unknown';
}
