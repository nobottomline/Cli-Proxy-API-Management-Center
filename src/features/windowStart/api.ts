import { apiCallApi } from '@/services/api/apiCall';
import { useAuthStore } from '@/stores/useAuthStore';
import { isRecord } from '@/utils/helpers';

export type WindowResult = {
  state: string;
  at: string;
  resetsAt?: string;
  usage?: { inputTokens: number; outputTokens: number };
  httpStatus?: number;
};
export type WindowAccount = {
  authIndex: string;
  name: string;
  disabled: boolean;
  result?: WindowResult;
};
export type WindowSnapshot = { busy: boolean; accounts: WindowAccount[] };

export const sessionId = () => {
  const { apiBase, managementKey } = useAuthStore.getState();
  return `${apiBase}\n${managementKey}`;
};

async function request(action: string, index?: string): Promise<Record<string, unknown>> {
  const revision = sessionId();
  const key = useAuthStore.getState().managementKey;
  const result = await apiCallApi.request({
    method: 'POST',
    url: 'http://127.0.0.1:18319/windows',
    // Only the internal loopback hop is direct. Provider connections remain
    // inside the gateway's mandatory ISP route and cgroup firewall.
    proxy_url: 'direct',
    header: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({ action, ...(index ? { auth_index: index } : {}) }),
  });
  if (sessionId() !== revision) throw new Error('Session changed');
  if (result.statusCode !== 200 || !isRecord(result.body)) {
    throw new Error('Window service unavailable');
  }
  return result.body;
}

function normalizeResult(raw: unknown): WindowResult | undefined {
  if (!isRecord(raw) || typeof raw.state !== 'string' || typeof raw.at !== 'string') {
    return undefined;
  }
  return {
    state: raw.state,
    at: raw.at,
    resetsAt: typeof raw.resets_at === 'string' ? raw.resets_at : undefined,
    httpStatus: typeof raw.http_status === 'number' ? raw.http_status : undefined,
    usage: isRecord(raw.usage)
      ? {
          inputTokens: Number(raw.usage.input_tokens ?? 0),
          outputTokens: Number(raw.usage.output_tokens ?? 0),
        }
      : undefined,
  };
}

export async function fetchWindows(): Promise<WindowSnapshot> {
  const raw = await request('status');
  if (!Array.isArray(raw.accounts) || typeof raw.busy !== 'boolean') {
    throw new Error('Invalid window status');
  }
  return {
    busy: raw.busy,
    accounts: raw.accounts.flatMap((account) => {
      if (
        !isRecord(account) ||
        typeof account.auth_index !== 'string' ||
        typeof account.name !== 'string'
      ) {
        return [];
      }
      return [
        {
          authIndex: account.auth_index,
          name: account.name,
          disabled: Boolean(account.disabled),
          result: normalizeResult(account.result),
        },
      ];
    }),
  };
}

export async function startWindow(index?: string): Promise<boolean> {
  return (await request('start', index)).accepted === true;
}
