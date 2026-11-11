import { create } from 'zustand';
import { createSocket, type Sock } from './socketTransport.ts';
import type { ErrorCode } from '../../shared/errors.ts';
import { ERROR_MESSAGES_AR } from '../../shared/errors.ts';
import type { ClientToServerEvents } from '../../shared/protocol.ts';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'auth-failed';

interface ConnState {
  status: ConnStatus;
  attempts: number;
  lastError: string | null;
  rtt: number | null;
}

export const useConnection = create<ConnState>(() => ({ status: 'idle', attempts: 0, lastError: null, rtt: null }));

let socket: Sock | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * One shared socket per tab. Socket.IO handles reconnection with capped
 * exponential backoff; after the cap we stop and show a manual retry button
 * instead of retrying forever.
 */
export function getSocket(): Sock {
  if (socket) return socket;
  const s: Sock = createSocket();
  socket = s;
  useConnection.setState({ status: 'connecting' });
  s.on('connect', () => {
    useConnection.setState({ status: 'connected', attempts: 0, lastError: null });
  });
  s.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') useConnection.setState({ status: 'idle' });
    else if (reason === 'io server disconnect') useConnection.setState({ status: 'auth-failed', lastError: ERROR_MESSAGES_AR.SESSION_EXPIRED });
    else useConnection.setState({ status: 'reconnecting' });
  });
  s.on('connect_error', (err) => {
    const code = (err as Error & { data?: { code?: ErrorCode } }).data?.code;
    if (code === 'UNAUTHENTICATED' || code === 'SESSION_EXPIRED' || code === 'FORBIDDEN') {
      useConnection.setState({ status: 'auth-failed', lastError: ERROR_MESSAGES_AR[code] });
      s.disconnect();
      return;
    }
    useConnection.setState((st) => ({ status: 'reconnecting', attempts: st.attempts + 1, lastError: ERROR_MESSAGES_AR.REALTIME_FAILED }));
  });
  s.io.on('reconnect_failed', () => useConnection.setState({ status: 'offline', lastError: ERROR_MESSAGES_AR.NETWORK }));
  s.io.on('reconnect_attempt', (n) => useConnection.setState({ status: 'reconnecting', attempts: n }));
  pingTimer = setInterval(() => {
    if (!s.connected) return;
    const t0 = performance.now();
    s.timeout(5000).emit('presence:ping', (err: Error | null) => {
      if (!err) useConnection.setState({ rtt: Math.round(performance.now() - t0) });
    });
  }, 10_000);
  return s;
}

/** Retry after the automatic attempts were exhausted or the session was renewed. */
export function reconnectSocket() {
  const s = getSocket();
  useConnection.setState({ status: 'connecting', attempts: 0 });
  s.disconnect();
  s.connect();
}

export function closeSocket() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  useConnection.setState({ status: 'idle' });
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

/** Emit with an acknowledgement and a timeout that yields a TIMEOUT/NETWORK error instead of hanging. */
export function request<T>(event: keyof ClientToServerEvents, payload: unknown, timeoutMs = 10_000): Promise<AckResult<T>> {
  const s = getSocket();
  return new Promise((resolve) => {
    if (!s.connected) {
      resolve({ ok: false, code: 'NETWORK', message: ERROR_MESSAGES_AR.REALTIME_FAILED });
      return;
    }
    (s.timeout(timeoutMs) as unknown as { emit: (e: string, p: unknown, cb: (err: Error | null, res: AckResult<T>) => void) => void }).emit(event, payload, (err, res) => {
      if (err) resolve({ ok: false, code: 'TIMEOUT', message: ERROR_MESSAGES_AR.TIMEOUT });
      else resolve(res);
    });
  });
}
