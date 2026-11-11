import type { ErrorCode } from './errors.ts';
import type { GameId, GameSettings } from './games.ts';

/** Public user information safe to show to other players. */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  isGuest: boolean;
  xp: number;
  level: number;
}

export interface SessionUser extends PublicUser {
  email: string | null;
  role: 'user' | 'admin';
  settings: UserSettings;
  favoriteGames: string[];
}

export interface UserSettings {
  sound: boolean;
  reducedMotion: boolean;
  allowInvites: 'everyone' | 'friends' | 'none';
  showOnline: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  sound: true,
  reducedMotion: false,
  allowInvites: 'everyone',
  showOnline: true,
};

export interface MemberView {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  isGuest: boolean;
  level: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  team: number | null;
  inGame: boolean;
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  kind: 'user' | 'system';
  userId: string | null;
  name: string;
  avatar: string;
  text: string;
  at: number;
}

export interface RoomView {
  id: string;
  code: string;
  version: number;
  hostId: string;
  visibility: 'private' | 'public';
  capacity: number;
  name: string;
  selectedGame: GameId;
  settings: GameSettings;
  status: 'lobby' | 'playing' | 'results';
  members: MemberView[];
  you: string;
  game: GameViewBase | null;
  matchNumber: number;
  createdAt: number;
  /** personal XP/achievement result of the last finished match */
  awards: { xp: number; level: number; unlocked: string[] } | null;
  voiceAvailable: boolean;
  /** custom content pack chosen for the selected game (null = official) */
  packId: string | null;
}

export interface FinalRanking {
  playerId: string;
  score: number;
  place: number;
}

export interface FinalResults {
  ranking: FinalRanking[];
  winners: string[];
  teamScores?: { team: number; score: number; members: string[] }[];
  winningTeam?: number | null;
  awards?: { playerId: string; title: string; emoji: string }[];
}

/** Every game view sent to a player extends this. */
export interface GameViewBase {
  gameId: GameId;
  phase: string;
  phaseKey: string;
  deadline: number | null;
  serverNow: number;
  round: number;
  totalRounds: number;
  players: string[];
  scores: Record<string, number>;
  finished: boolean;
  results: FinalResults | null;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------

export type Ack<T = unknown> = (res: { ok: true; data: T } | { ok: false; code: ErrorCode; message: string }) => void;

export interface RoomActionPayload {
  code: string;
  actionId: string;
  type: string;
  payload?: unknown;
  phaseKey?: string;
}

export interface DrawSegment {
  /** stroke id, unique per drawer turn */
  s: number;
  /** palette color index */
  c: number;
  /** brush size index */
  w: number;
  /** eraser */
  e?: 1;
  /** flattened points, each coordinate quantized to 0..1000 */
  p: number[];
}

export interface DrawEvent {
  turnKey: string;
  op: 'seg' | 'clear' | 'undo';
  seg?: DrawSegment;
}

export interface ClientToServerEvents {
  'room:join': (p: { code: string }, ack: Ack<RoomView>) => void;
  'room:leave': (p: { code: string }, ack: Ack<null>) => void;
  'room:action': (p: RoomActionPayload, ack: Ack<{ duplicate?: boolean }>) => void;
  'room:chat': (p: { code: string; text: string; clientId: string }, ack: Ack<null>) => void;
  'room:sync': (p: { code: string }, ack: Ack<RoomView>) => void;
  'draw:event': (p: { code: string } & DrawEvent, ack?: Ack<null>) => void;
  'draw:sync': (p: { code: string }, ack: Ack<{ turnKey: string; segments: DrawSegment[] }>) => void;
  'presence:ping': (ack: Ack<{ now: number }>) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'room:chat': (msg: ChatMessage) => void;
  'room:kicked': (p: { code: string }) => void;
  'room:closed': (p: { code: string; reason: string }) => void;
  'room:toast': (p: { kind: 'info' | 'success' | 'warning' | 'error'; text: string }) => void;
  'draw:event': (p: DrawEvent) => void;
  'invite:new': (p: InviteView) => void;
  'friends:update': () => void;
}

export interface InviteView {
  id: string;
  roomCode: string;
  roomName: string;
  gameId: GameId;
  from: PublicUser;
  createdAt: string;
}

export interface PublicRoomSummary {
  code: string;
  name: string;
  gameId: GameId;
  players: number;
  capacity: number;
  status: RoomView['status'];
  host: { name: string; avatar: string };
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

/** XP → level curve: level n needs 100*n*(n+1)/2 total XP. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= (100 * level * (level + 1)) / 2) level++;
  return level;
}

export function xpForLevel(level: number): number {
  return (100 * (level - 1) * level) / 2;
}

export const RANKS = [
  { min: 1, name: 'مبتدئ خبّيص', emoji: '🐣' },
  { min: 3, name: 'لعّيب حارة', emoji: '🎲' },
  { min: 6, name: 'نجم الجَمعة', emoji: '⭐' },
  { min: 10, name: 'معلّم خبصة', emoji: '🔥' },
  { min: 15, name: 'أسطورة الشلّة', emoji: '👑' },
  { min: 25, name: 'سلطان الخبصة', emoji: '🏆' },
];

export function rankForLevel(level: number) {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x.min) r = x;
  return r;
}
