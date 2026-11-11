import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.ts';

export type Sock = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Server edition: a Socket.IO connection to the KHABSA server.
 * (The GitHub Pages build swaps this module for src/client/p2p/transport.ts.)
 */
export function createSocket(): Sock {
  return io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.4,
    timeout: 12_000,
  });
}
