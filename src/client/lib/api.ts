import { ERROR_MESSAGES_AR, type ErrorCode } from '../../shared/errors.ts';
import { localApi } from './localApi.ts';

/** Error thrown by API calls. `code` distinguishes network/timeout failures from server answers. */
export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  constructor(code: ErrorCode, message?: string, status = 0) {
    super(message ?? ERROR_MESSAGES_AR[code] ?? ERROR_MESSAGES_AR.SERVER_ERROR);
    this.code = code;
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const local = localApi(path, { method, body: opts.body });
  if (local) return local as Promise<T>;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), opts.timeoutMs ?? 15_000);
  opts.signal?.addEventListener('abort', () => ctrl.abort('cancelled'), { once: true });
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      signal: ctrl.signal,
      headers: { 'x-khabsa': '1', ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    if (ctrl.signal.reason === 'timeout') throw new ApiError('TIMEOUT');
    if (ctrl.signal.reason === 'cancelled') throw new ApiError('NETWORK', 'أُلغي الطلب');
    throw new ApiError('NETWORK');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw new ApiError(res.status >= 500 ? 'SERVER_ERROR' : 'VALIDATION', undefined, res.status);
    return text as T;
  }
  if (!res.ok) {
    const d = data as { code?: ErrorCode; message?: string } | null;
    throw new ApiError(d?.code ?? (res.status >= 500 ? 'SERVER_ERROR' : 'VALIDATION'), d?.message, res.status);
  }
  return data as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as Error).message);
  return ERROR_MESSAGES_AR.SERVER_ERROR;
}

export function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
