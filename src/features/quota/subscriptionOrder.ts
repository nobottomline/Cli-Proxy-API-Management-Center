import type { QuotaFileEntry } from './logic';
import type { QuotaCardState } from './providers';

/** Use reported subscription metadata, never infer a plan from an account name. */
export function subscriptionRank(entry: QuotaFileEntry, quota?: QuotaCardState): number {
  if (!quota) return 0;
  let plan: unknown;
  if ('planType' in quota) plan = quota.planType;
  else if ('subscription' in quota) {
    const subscription = quota.subscription;
    if (subscription && typeof subscription === 'object' && 'plan' in subscription) {
      plan = subscription.plan;
    }
  } else if ('plan' in quota) plan = quota.plan;
  else if ('planName' in quota) plan = quota.planName;
  else if ('planLabel' in quota) plan = quota.planLabel;
  if (typeof plan !== 'string') return 0;
  const normalized = plan
    .trim()
    .toLowerCase()
    .replace(/^plan_/, '');
  // Claude's API retains the old Max 20x identifier after the Ultra rename.
  if (normalized === 'ultra' || (entry.type === 'claude' && normalized === 'max20')) return 600;
  if (normalized === 'ultra-lite') return 550;
  if (['max', 'max5'].includes(normalized)) return 500;
  if (normalized === 'pro') return 400;
  if (normalized === 'plus') return 300;
  if (['team', 'business', 'enterprise'].includes(normalized)) return 200;
  if (normalized === 'free') return 100;
  return 0;
}
