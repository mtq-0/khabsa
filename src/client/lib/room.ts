import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ErrorCode } from '../../shared/errors.ts';
import type { ChatMessage, RoomView } from '../../shared/protocol.ts';
import { uid } from './api.ts';
import { getSocket, request, useConnection, type AckResult } from './socket.ts';

export type RoomStatus = 'joining' | 'joined' | 'error' | 'kicked' | 'closed';

export interface RoomApi {
  code: string;
  view: RoomView | null;
  status: RoomStatus;
  error: { code: ErrorCode; message: string } | null;
  chat: ChatMessage[];
  /** serverTime - localTime, used by countdowns */
  clockOffset: number;
  act<T = unknown>(type: string, payload?: unknown, opts?: { phaseKey?: string }): Promise<AckResult<T>>;
  sendChat(text: string): Promise<AckResult<null>>;
  leave(): Promise<void>;
  rejoin(): void;
}

export const RoomContext = createContext<RoomApi | null>(null);
export function useRoomContext(): RoomApi {
  const r = useContext(RoomContext);
  if (!r) throw new Error('RoomContext missing');
  return r;
}

export function useRoom(code: string): RoomApi {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<RoomStatus>('joining');
  const [error, setError] = useState<RoomApi['error']>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const versionRef = useRef(-1);
  const roomIdRef = useRef<string | null>(null);
  const conn = useConnection((s) => s.status);
  const joiningRef = useRef(false);

  const accept = useCallback((v: RoomView) => {
    // stale-event rejection: never replace newer state with an older version
    if (roomIdRef.current && roomIdRef.current === v.id && v.version < versionRef.current) return;
    roomIdRef.current = v.id;
    versionRef.current = v.version;
    if (v.game) setClockOffset(v.game.serverNow - Date.now());
    setView(v);
  }, []);

  const join = useCallback(async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    try {
      const r = await request<RoomView>('room:join', { code });
      if (r.ok) {
        // a fresh join after reconnect may legitimately reset version tracking
        versionRef.current = -1;
        accept(r.data);
        setStatus('joined');
        setError(null);
      } else {
        // network problems are NOT reported as "room not found"
        if (r.code === 'NETWORK' || r.code === 'TIMEOUT') {
          setError({ code: r.code, message: r.message });
          if (!view) setStatus('joining');
        } else {
          setError({ code: r.code, message: r.message });
          setStatus(r.code === 'KICKED' ? 'kicked' : 'error');
        }
      }
    } finally {
      joiningRef.current = false;
    }
  }, [code, accept, view]);

  useEffect(() => {
    const s = getSocket();
    const onState = (v: RoomView) => {
      if (v.code === code) accept(v);
    };
    const onChat = (m: ChatMessage) =>
      setChat((c) => {
        if (c.some((x) => x.id === m.id)) return c;
        const next = [...c, m];
        return next.length > 200 ? next.slice(-200) : next;
      });
    const onKicked = (p: { code: string }) => {
      if (p.code === code) {
        setStatus('kicked');
        setError({ code: 'KICKED', message: 'المضيف طلّعك من هالغرفة.' });
      }
    };
    const onClosed = (p: { code: string }) => {
      if (p.code === code) setStatus('closed');
    };
    s.on('room:state', onState);
    s.on('room:chat', onChat);
    s.on('room:kicked', onKicked);
    s.on('room:closed', onClosed);
    return () => {
      s.off('room:state', onState);
      s.off('room:chat', onChat);
      s.off('room:kicked', onKicked);
      s.off('room:closed', onClosed);
    };
  }, [code, accept]);

  // (re)join whenever the realtime connection becomes available
  useEffect(() => {
    if (conn === 'connected' && status !== 'kicked' && status !== 'closed' && status !== 'error') void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, code]);

  const act = useCallback(
    async <T,>(type: string, payload?: unknown, opts?: { phaseKey?: string }): Promise<AckResult<T>> => {
      const actionId = uid();
      const body = { code, actionId, type, payload, phaseKey: opts?.phaseKey };
      let r = await request<T>('room:action', body);
      // safe single retry: the server de-duplicates by actionId
      if (!r.ok && r.code === 'TIMEOUT') r = await request<T>('room:action', body);
      return r;
    },
    [code],
  );

  const sendChat = useCallback((text: string) => request<null>('room:chat', { code, text, clientId: uid() }), [code]);
  const leave = useCallback(async () => {
    await request('room:leave', { code });
  }, [code]);
  const rejoin = useCallback(() => {
    setStatus('joining');
    setError(null);
    void join();
  }, [join]);

  return { code, view, status, error, chat, clockOffset, act, sendChat, leave, rejoin };
}
