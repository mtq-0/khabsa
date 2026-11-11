/**
 * Authoritative room + game state. All mutations of a room run inside that
 * room's serial lock, so concurrent socket events can never interleave.
 * Every successful mutation bumps room.version and sends each member a
 * personalized projection (secrets are filtered per viewer by the engines).
 * Rooms are snapshotted to Postgres (debounced) and restored on boot.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { AppError } from '../../shared/errors.ts';
import { GAMES, isGameId, sanitizeSettings, type GameId, type GameSettings } from '../../shared/games.ts';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_RE,
  levelForXp,
  normalizeRoomCode,
  type ChatMessage,
  type ClientToServerEvents,
  type DrawEvent,
  type DrawSegment,
  type MemberView,
  type PublicRoomSummary,
  type RoomView,
  type ServerToClientEvents,
} from '../../shared/protocol.ts';
import type { Db } from '../db/db.ts';
import type { ContentRepo } from '../content/content.ts';
import { KIND_FOR_GAME } from '../content/content.ts';
import type { StatsService } from '../stats/stats.ts';
import type { Platform } from '../platform.ts';
import type { EngineRegistry } from '../games/registry.ts';
import type { BaseState, ContentKind, EngineCtx } from '../games/types.ts';
import { cleanText, maskProfanity } from '../security/text.ts';
import { normalizeArabic } from '../../shared/arabic.ts';
import type { UserRow } from '../auth/auth.ts';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface Member {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  isGuest: boolean;
  level: number;
  ready: boolean;
  team: number | null;
  joinedAt: number;
  disconnectedAt: number | null;
  sockets: Set<string>;
}

interface GameSession {
  gameId: GameId;
  state: BaseState;
  matchId: string | null;
  participants: string[];
  startedAt: number;
  recorded: boolean;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  hostId: string;
  visibility: 'private' | 'public';
  capacity: number;
  createdAt: number;
  lastActivity: number;
  members: Map<string, Member>;
  kicked: Set<string>;
  selectedGame: GameId;
  settingsByGame: Partial<Record<GameId, GameSettings>>;
  packByGame: Partial<Record<GameId, string | null>>;
  status: 'lobby' | 'playing' | 'results';
  game: GameSession | null;
  version: number;
  matchNumber: number;
  chat: ChatMessage[];
  recentActions: string[];
  recentActionSet: Set<string>;
  usedContent: Partial<Record<ContentKind, string[]>>;
  drawing: { turnKey: string; segments: DrawSegment[]; points: number };
  awards: Record<string, { xp: number; level: number; unlocked: string[] }>;
  chatIds: Set<string>;
  lastChat: Map<string, { text: string; at: number }>;
  // runtime only
  timer: NodeJS.Timeout | null;
  lock: Promise<unknown>;
  closed: boolean;
}

export interface RoomDeps {
  db: Db;
  io: IO;
  content: ContentRepo;
  stats: StatsService;
  platform: Platform;
  engines: EngineRegistry;
  voiceAvailable: boolean;
  idleMinutes: number;
  onKick?: (room: Room, userId: string) => void;
  rng?: () => number;
  now?: () => number;
}

const HOST_GRACE_MS = 45_000;
const DISCONNECTED_MEMBER_TTL_MS = 10 * 60_000;
const MAX_SEGMENTS = 6000;
const MAX_POINTS = 120_000;
const MAX_CHAT = 60;

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private byId = new Map<string, Room>();
  private createRequests = new Map<string, { requestId: string; code: string; at: number }>();
  private persistTimers = new Map<string, NodeJS.Timeout>();
  private sweeper: NodeJS.Timeout;
  private deps: RoomDeps;
  private rng: () => number;
  private now: () => number;

  constructor(deps: RoomDeps) {
    this.deps = deps;
    this.rng = deps.rng ?? Math.random;
    this.now = deps.now ?? Date.now;
    this.sweeper = setInterval(() => void this.sweep(), 15_000);
    this.sweeper.unref();
  }

  // -------------------------------------------------------------------------
  // locking
  // -------------------------------------------------------------------------
  private withLock<T>(room: Room, fn: () => Promise<T> | T): Promise<T> {
    const run = room.lock.then(async () => {
      if (room.closed) throw new AppError('ROOM_CLOSED');
      return fn();
    });
    room.lock = run.catch(() => {});
    return run;
  }

  private getRoom(rawCode: unknown): Room {
    if (typeof rawCode !== 'string') throw new AppError('INVALID_CODE');
    const code = normalizeRoomCode(rawCode);
    if (!ROOM_CODE_RE.test(code)) throw new AppError('INVALID_CODE');
    const room = this.rooms.get(code);
    if (!room || room.closed) throw new AppError('ROOM_NOT_FOUND');
    return room;
  }

  private requireMember(room: Room, userId: string): Member {
    const m = room.members.get(userId);
    if (!m) throw new AppError(room.kicked.has(userId) ? 'KICKED' : 'NOT_MEMBER');
    return m;
  }

  private requireHost(room: Room, userId: string) {
    this.requireMember(room, userId);
    if (room.hostId !== userId) throw new AppError('NOT_HOST');
  }

  // -------------------------------------------------------------------------
  // creation / joining
  // -------------------------------------------------------------------------
  private generateCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let c = '';
      for (let i = 0; i < 6; i++) c += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new AppError('SERVER_ERROR', 'ما قدرنا نولّد رمز غرفة.');
  }

  async create(user: UserRow, opts: { visibility?: unknown; capacity?: unknown; gameId?: unknown; name?: unknown; requestId?: unknown }): Promise<{ code: string }> {
    const platform = await this.deps.platform.settings();
    const requestId = typeof opts.requestId === 'string' ? opts.requestId.slice(0, 64) : null;
    const prev = this.createRequests.get(user.id);
    // idempotency: a double-click / retry with the same request id returns the same room
    if (requestId && prev && prev.requestId === requestId && this.rooms.has(prev.code)) return { code: prev.code };
    const visibility = opts.visibility === 'public' && platform.allowPublicRooms ? 'public' : 'private';
    const maxCap = Math.min(12, Number(platform.maxRoomCapacity) || 12);
    const capacity = Math.max(2, Math.min(maxCap, Number.isInteger(opts.capacity) ? (opts.capacity as number) : 8));
    const gameId: GameId = isGameId(opts.gameId) ? opts.gameId : 'outsider-word';
    const name = maskProfanity(cleanText(opts.name, 40)) || `غرفة ${user.display_name}`;
    const code = this.generateCode();
    const id = randomUUID();
    const now = this.now();
    try {
      await this.deps.db.query('insert into rooms (id, code, host_id, visibility, status) values ($1, $2, $3, $4, $5)', [id, code, user.id, visibility, 'open']);
    } catch (e) {
      // unique violation on open code (another instance) → retry once with a new code
      if (String((e as Error).message).includes('rooms_open_code_key')) return this.create(user, opts);
      throw e;
    }
    const room: Room = {
      id,
      code,
      name,
      hostId: user.id,
      visibility,
      capacity,
      createdAt: now,
      lastActivity: now,
      members: new Map(),
      kicked: new Set(),
      selectedGame: gameId,
      settingsByGame: { [gameId]: sanitizeSettings(gameId, {}) },
      packByGame: {},
      status: 'lobby',
      game: null,
      version: 0,
      matchNumber: 0,
      chat: [],
      recentActions: [],
      recentActionSet: new Set(),
      usedContent: {},
      drawing: { turnKey: '', segments: [], points: 0 },
      awards: {},
      chatIds: new Set(),
      lastChat: new Map(),
      timer: null,
      lock: Promise.resolve(),
      closed: false,
    };
    this.rooms.set(code, room);
    this.byId.set(id, room);
    this.createRequests.set(user.id, { requestId: requestId ?? randomUUID(), code, at: now });
    this.persist(room);
    return { code };
  }

  async join(user: UserRow, socket: Sock | null, rawCode: unknown): Promise<RoomView> {
    const room = this.getRoom(rawCode);
    return this.withLock(room, async () => {
      if (room.kicked.has(user.id)) throw new AppError('KICKED');
      let m = room.members.get(user.id);
      const isNew = !m;
      if (!m) {
        if (room.members.size >= room.capacity) throw new AppError('ROOM_FULL');
        const blocked = await this.deps.db.query('select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1', [room.hostId, user.id]);
        if (blocked.rowCount) throw new AppError('FORBIDDEN', 'ما بتقدر تدخل هالغرفة.');
        m = {
          id: user.id,
          name: user.display_name,
          avatar: user.avatar,
          avatarUrl: user.avatar_url,
          isGuest: user.is_guest,
          level: levelForXp(user.xp),
          ready: false,
          team: null,
          joinedAt: this.now(),
          disconnectedAt: null,
          sockets: new Set(),
        };
        room.members.set(user.id, m);
        await this.deps.db.query(
          `insert into room_members (room_id, user_id) values ($1, $2) on conflict (room_id, user_id) do update set left_at = null, joined_at = now()`,
          [room.id, user.id],
        );
      } else {
        // refresh profile details on rejoin
        m.name = user.display_name;
        m.avatar = user.avatar;
        m.avatarUrl = user.avatar_url;
        m.level = levelForXp(user.xp);
      }
      const wasOffline = m.sockets.size === 0;
      if (socket) {
        m.sockets.add(socket.id);
        void socket.join(this.channel(room));
        (socket.data.rooms as Set<string>).add(room.code);
      }
      m.disconnectedAt = null;
      if (isNew) this.system(room, `${m.name} دخل الغرفة 👋`);
      else if (wasOffline) this.system(room, `${m.name} رجع 🔌`);
      this.touch(room);
      return this.viewFor(room, user.id);
    });
  }

  async leave(userId: string, rawCode: unknown, reason: 'left' | 'kicked' = 'left'): Promise<void> {
    const room = this.getRoom(rawCode);
    await this.withLock(room, () => this.removeMember(room, userId, reason));
  }

  private async removeMember(room: Room, userId: string, reason: 'left' | 'kicked' | 'expired') {
    const m = room.members.get(userId);
    if (!m) return;
    room.members.delete(userId);
    for (const sid of m.sockets) {
      const s = this.deps.io.sockets.sockets.get(sid);
      if (s) {
        void s.leave(this.channel(room));
        (s.data.rooms as Set<string>).delete(room.code);
        if (reason === 'kicked') s.emit('room:kicked', { code: room.code });
      }
    }
    await this.deps.db.query('update room_members set left_at = now(), kicked = $3 where room_id = $1 and user_id = $2', [room.id, userId, reason === 'kicked']);
    if (reason === 'kicked') room.kicked.add(userId);
    this.system(room, reason === 'kicked' ? `${m.name} انطرد من الغرفة` : `${m.name} طلع من الغرفة`);
    if (room.members.size === 0) return this.close(room, 'empty');
    if (room.game && room.status === 'playing' && room.game.participants.includes(userId)) {
      this.applyEngine(room, (engine, draft, ctx) => engine.playerLeft?.(draft, userId, ctx));
    }
    if (room.hostId === userId) this.migrateHost(room);
    this.touch(room);
  }

  private migrateHost(room: Room) {
    const candidates = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const next = candidates.find((c) => c.sockets.size > 0) ?? candidates[0];
    if (!next || next.id === room.hostId) return;
    room.hostId = next.id;
    this.system(room, `${next.name} صار المضيف 👑`);
  }

  onDisconnect(socket: Sock) {
    const codes = [...((socket.data.rooms as Set<string>) ?? [])];
    for (const code of codes) {
      const room = this.rooms.get(code);
      if (!room) continue;
      void this.withLock(room, () => {
        const m = [...room.members.values()].find((x) => x.sockets.has(socket.id));
        if (!m) return;
        m.sockets.delete(socket.id);
        if (m.sockets.size === 0) {
          m.disconnectedAt = this.now();
          this.system(room, `${m.name} انقطع اتصاله ⚠️`);
          this.touch(room);
        }
      }).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // actions
  // -------------------------------------------------------------------------
  async action(user: UserRow, p: { code?: unknown; actionId?: unknown; type?: unknown; payload?: unknown; phaseKey?: unknown }): Promise<{ duplicate?: boolean }> {
    const room = this.getRoom(p.code);
    if (typeof p.type !== 'string' || p.type.length > 40) throw new AppError('VALIDATION');
    if (typeof p.actionId !== 'string' || p.actionId.length < 8 || p.actionId.length > 64) throw new AppError('VALIDATION', 'actionId مطلوب');
    const actionKey = `${user.id}:${p.actionId}`;
    const type = p.type;
    return this.withLock(room, async () => {
      this.requireMember(room, user.id);
      if (room.recentActionSet.has(actionKey)) return { duplicate: true };
      await this.dispatch(room, user, type, p.payload, typeof p.phaseKey === 'string' ? p.phaseKey : undefined);
      room.recentActionSet.add(actionKey);
      room.recentActions.push(actionKey);
      if (room.recentActions.length > 500) room.recentActionSet.delete(room.recentActions.shift()!);
      this.touch(room);
      return {};
    });
  }

  private async dispatch(room: Room, user: UserRow, type: string, payload: unknown, phaseKey?: string) {
    const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const member = this.requireMember(room, user.id);
    if (type.startsWith('game:')) {
      const g = room.game;
      if (!g || room.status !== 'playing') throw new AppError('INVALID_ACTION', 'ما في لعبة شغالة.');
      const gameType = type.slice(5);
      if (gameType.startsWith('host:')) this.requireHost(room, user.id);
      if (phaseKey && phaseKey !== g.state.phaseKey) throw new AppError('STALE_ACTION');
      this.applyEngine(room, (engine, draft, ctx) => engine.act(draft, user.id, gameType, payload, ctx));
      return;
    }
    switch (type) {
      case 'ready': {
        if (room.status !== 'lobby' && room.status !== 'results') throw new AppError('INVALID_ACTION');
        member.ready = obj.ready !== false;
        return;
      }
      case 'team': {
        const target = typeof obj.userId === 'string' && obj.userId !== user.id ? obj.userId : user.id;
        if (target !== user.id) this.requireHost(room, user.id);
        const tm = this.requireMember(room, target);
        tm.team = obj.team === 0 || obj.team === 1 ? obj.team : null;
        return;
      }
      case 'select-game': {
        this.requireHost(room, user.id);
        if (room.status === 'playing') throw new AppError('INVALID_ACTION', 'خلّصوا اللعبة الحالية أول.');
        if (!isGameId(obj.gameId)) throw new AppError('VALIDATION');
        if (!(await this.deps.platform.gameEnabled(obj.gameId))) throw new AppError('GAME_DISABLED');
        room.selectedGame = obj.gameId;
        room.settingsByGame[obj.gameId] ??= sanitizeSettings(obj.gameId, {});
        room.status = 'lobby';
        for (const m of room.members.values()) m.ready = false;
        return;
      }
      case 'settings': {
        this.requireHost(room, user.id);
        if (room.status === 'playing') throw new AppError('INVALID_ACTION');
        room.settingsByGame[room.selectedGame] = sanitizeSettings(room.selectedGame, obj.settings);
        return;
      }
      case 'set-pack': {
        this.requireHost(room, user.id);
        if (room.status === 'playing') throw new AppError('INVALID_ACTION');
        const packId = obj.packId;
        if (packId == null || packId === '') {
          room.packByGame[room.selectedGame] = null;
          return;
        }
        if (typeof packId !== 'string' || !/^[0-9a-f-]{36}$/.test(packId)) throw new AppError('VALIDATION');
        const r = await this.deps.db.query<{ kind: string; owner_id: string | null; official: boolean; status: string }>('select kind, owner_id, official, status from content_packs where id = $1', [packId]);
        const pack = r.rows[0];
        if (!pack || pack.status !== 'active') throw new AppError('NOT_FOUND');
        if (pack.kind !== KIND_FOR_GAME[room.selectedGame]) throw new AppError('VALIDATION', 'الحزمة مش لهاللعبة.');
        if (!pack.official && pack.owner_id !== user.id) throw new AppError('FORBIDDEN');
        room.packByGame[room.selectedGame] = packId;
        return;
      }
      case 'room-settings': {
        this.requireHost(room, user.id);
        const platform = await this.deps.platform.settings();
        if (obj.visibility === 'public' || obj.visibility === 'private') room.visibility = obj.visibility === 'public' && platform.allowPublicRooms ? 'public' : 'private';
        if (Number.isInteger(obj.capacity)) room.capacity = Math.max(Math.max(2, room.members.size), Math.min(Math.min(12, platform.maxRoomCapacity), obj.capacity as number));
        if (typeof obj.name === 'string') room.name = maskProfanity(cleanText(obj.name, 40)) || room.name;
        return;
      }
      case 'kick': {
        this.requireHost(room, user.id);
        if (typeof obj.userId !== 'string' || obj.userId === user.id) throw new AppError('VALIDATION');
        this.requireMember(room, obj.userId);
        await this.removeMember(room, obj.userId, 'kicked');
        this.deps.onKick?.(room, obj.userId);
        return;
      }
      case 'transfer-host': {
        this.requireHost(room, user.id);
        if (typeof obj.userId !== 'string') throw new AppError('VALIDATION');
        const target = this.requireMember(room, obj.userId);
        room.hostId = target.id;
        this.system(room, `${target.name} صار المضيف 👑`);
        return;
      }
      case 'start':
      case 'rematch': {
        this.requireHost(room, user.id);
        if (room.status === 'playing') throw new AppError('INVALID_ACTION', 'في لعبة شغالة.');
        await this.startGame(room, type === 'start');
        return;
      }
      case 'end-game': {
        this.requireHost(room, user.id);
        if (!room.game) throw new AppError('INVALID_ACTION');
        this.clearTimer(room);
        room.game = null;
        room.status = 'lobby';
        this.system(room, 'المضيف وقّف اللعبة.');
        return;
      }
      case 'back-to-lobby': {
        this.requireHost(room, user.id);
        if (room.status === 'playing') throw new AppError('INVALID_ACTION');
        room.status = 'lobby';
        room.game = null;
        for (const m of room.members.values()) m.ready = false;
        return;
      }
      default:
        throw new AppError('INVALID_ACTION');
    }
  }

  private async startGame(room: Room, requireReady: boolean) {
    const gameId = room.selectedGame;
    if (!(await this.deps.platform.gameEnabled(gameId))) throw new AppError('GAME_DISABLED');
    const engine = this.deps.engines[gameId];
    const players = [...room.members.values()].filter((m) => m.sockets.size > 0 || m.id === room.hostId).sort((a, b) => a.joinedAt - b.joinedAt);
    if (players.length < engine.minPlayers) throw new AppError('NOT_ENOUGH_PLAYERS', `هاللعبة بدها ${engine.minPlayers} لاعبين متصلين على الأقل.`);
    if (players.length > engine.maxPlayers) throw new AppError('TOO_MANY_PLAYERS');
    if (requireReady) {
      const notReady = players.filter((p) => p.id !== room.hostId && !p.ready);
      if (notReady.length) throw new AppError('INVALID_ACTION', `لسا مش جاهزين: ${notReady.map((p) => p.name).join('، ')}`);
    }
    const settings = room.settingsByGame[gameId] ?? sanitizeSettings(gameId, {});
    const req = engine.content(settings, players.length);
    const packId = room.packByGame[gameId] ?? null;
    const difficulty =
      gameId === 'outsider-picture' ? (settings.mode === 'hard' ? 'hard' : settings.mode === 'normal' ? 'medium' : 'mixed') : String(settings.difficulty ?? 'mixed');
    const used = room.usedContent[req.kind] ?? [];
    let content = await this.deps.content.pick({ kind: req.kind, count: req.count, category: String(settings.category ?? 'any'), difficulty, packId, exclude: used });
    if (!content.length && (settings.category !== 'any' || difficulty !== 'mixed')) {
      // fall back to any category/difficulty rather than failing the start
      content = await this.deps.content.pick({ kind: req.kind, count: req.count, packId, exclude: used, difficulty: gameId === 'outsider-picture' ? difficulty : undefined });
    }
    const decoys = req.decoys ? await this.deps.content.pick({ kind: req.kind, count: req.decoys, packId: null }) : [];
    const ctx = this.ctx();
    const state = engine.init({ players: players.map((p) => ({ id: p.id, name: p.name, team: p.team })), settings, content, decoys, categoryNames: await this.deps.content.categoryNames() }, ctx);
    room.usedContent[req.kind] = [...used, ...content.map((c) => c.id)].slice(-300);
    const matchId = await this.deps.stats.startMatch(room.id, gameId, players.length, room.hostId);
    room.matchNumber += 1;
    room.game = { gameId, state, matchId, participants: players.map((p) => p.id), startedAt: ctx.now, recorded: false };
    room.status = 'playing';
    room.awards = {};
    room.drawing = { turnKey: '', segments: [], points: 0 };
    for (const m of room.members.values()) m.ready = false;
    this.system(room, `بلّشت لعبة ${GAMES[gameId].emoji} ${GAMES[gameId].name}!`);
    this.schedule(room);
  }

  private ctx(): EngineCtx {
    return { now: this.now(), rng: this.rng };
  }

  /** Clone-mutate-commit: a throwing engine leaves the state untouched. */
  private applyEngine(room: Room, fn: (engine: EngineRegistry[GameId], draft: BaseState, ctx: EngineCtx) => void) {
    const g = room.game!;
    const engine = this.deps.engines[g.gameId];
    const draft = structuredClone(g.state);
    fn(engine, draft, this.ctx());
    g.state = draft;
    this.afterEngine(room);
  }

  private afterEngine(room: Room) {
    const g = room.game!;
    if (g.state.finished && !g.recorded) {
      g.recorded = true;
      room.status = 'results';
      this.clearTimer(room);
      void this.record(room, g);
    } else this.schedule(room);
  }

  private async record(room: Room, g: GameSession) {
    if (!g.matchId || !g.state.results) return;
    try {
      const streaks = (g.state as unknown as { bestStreak?: Record<string, number> }).bestStreak;
      const awards = await this.deps.stats.finishMatch(g.matchId, g.state.results, g.participants, { streaks });
      await this.recordRecentPlayers(g);
      await this.withLock(room, () => {
        for (const a of awards) room.awards[a.userId] = { xp: a.xp, level: a.level, unlocked: a.unlocked };
        for (const a of awards) {
          const m = room.members.get(a.userId);
          if (m) m.level = a.level;
        }
        this.touch(room);
      });
    } catch (e) {
      console.error('[rooms] failed to record match', (e as Error).message);
    }
  }

  private async recordRecentPlayers(g: GameSession) {
    const ids = g.participants;
    if (ids.length < 2 || ids.length > 12) return;
    const params: unknown[] = [];
    const values: string[] = [];
    for (const a of ids) for (const b of ids) if (a !== b) {
      params.push(a, b, g.gameId);
      values.push(`($${params.length - 2}::uuid, $${params.length - 1}::uuid, now(), $${params.length})`);
    }
    await this.deps.db.query(
      `insert into recent_players (user_id, other_id, last_played_at, game_id) values ${values.join(',')}
       on conflict (user_id, other_id) do update set last_played_at = now(), game_id = excluded.game_id`,
      params,
    );
  }

  // -------------------------------------------------------------------------
  // timers
  // -------------------------------------------------------------------------
  private clearTimer(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }

  private schedule(room: Room) {
    this.clearTimer(room);
    const g = room.game;
    if (!g || g.state.finished || room.closed) return;
    const engine = this.deps.engines[g.gameId];
    const wake = engine.nextWake?.(g.state, this.now()) ?? g.state.deadline;
    if (wake == null) return;
    const delay = Math.max(0, Math.min(2 ** 31 - 1, wake - this.now()));
    const phaseKey = g.state.phaseKey;
    room.timer = setTimeout(() => {
      room.timer = null;
      void this.withLock(room, () => {
        const cur = room.game;
        if (!cur || cur !== g || cur.state.finished) return;
        // the phase may have advanced since this timer was scheduled
        if (cur.state.phaseKey !== phaseKey && (cur.state.deadline ?? Infinity) > this.now()) return this.schedule(room);
        this.applyEngine(room, (eng, draft, ctx) => eng.tick(draft, ctx));
        this.touch(room);
      }).catch((e) => {
        if (!(e instanceof AppError)) console.error('[rooms] tick failed', e);
      });
    }, delay);
    room.timer.unref?.();
  }

  // -------------------------------------------------------------------------
  // chat
  // -------------------------------------------------------------------------
  async chat(user: UserRow, p: { code?: unknown; text?: unknown; clientId?: unknown }) {
    const room = this.getRoom(p.code);
    const platform = await this.deps.platform.settings();
    if (!platform.chatEnabled) throw new AppError('FORBIDDEN', 'الشات متوقف حالياً.');
    await this.withLock(room, () => {
      const m = this.requireMember(room, user.id);
      const clientId = typeof p.clientId === 'string' ? p.clientId.slice(0, 64) : '';
      if (clientId && room.chatIds.has(clientId)) return; // duplicate delivery
      let text = maskProfanity(cleanText(p.text, 300));
      if (!text) throw new AppError('VALIDATION');
      const last = room.lastChat.get(user.id);
      const now = this.now();
      if (last && last.text === text && now - last.at < 5000) throw new AppError('RATE_LIMITED', 'نفس الرسالة؟ استنى شوي.');
      room.lastChat.set(user.id, { text, at: now });
      text = this.maskSecrets(room, text);
      const msg: ChatMessage = { id: clientId || randomUUID(), kind: 'user', userId: user.id, name: m.name, avatar: m.avatar, text, at: now };
      if (clientId) {
        room.chatIds.add(clientId);
        if (room.chatIds.size > 300) room.chatIds.delete(room.chatIds.values().next().value!);
      }
      this.pushChat(room, msg);
    });
  }

  /** Prevent spoiling secret words (e.g. the draw & guess word) in room chat. */
  private maskSecrets(room: Room, text: string): string {
    const g = room.game;
    if (!g || room.status !== 'playing') return text;
    const secrets = this.deps.engines[g.gameId].chatSecrets?.(g.state) ?? [];
    if (!secrets.length) return text;
    const norm = ` ${normalizeArabic(text)} `;
    const compact = normalizeArabic(text).replace(/\s/g, '');
    for (const s of secrets) {
      const n = normalizeArabic(s);
      if (n && (norm.includes(` ${n} `) || (n.length >= 3 && compact.includes(n.replace(/\s/g, ''))))) return '🤐 (رسالة فيها الكلمة السرية انخفت)';
    }
    return text;
  }

  private system(room: Room, text: string) {
    this.pushChat(room, { id: randomUUID(), kind: 'system', userId: null, name: 'خبصة', avatar: '0-0', text, at: this.now() });
  }

  private pushChat(room: Room, msg: ChatMessage) {
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    this.deps.io.to(this.channel(room)).emit('room:chat', msg);
  }

  chatHistory(room: Room) {
    return room.chat;
  }

  // -------------------------------------------------------------------------
  // drawing (draw & guess)
  // -------------------------------------------------------------------------
  draw(user: UserRow, socket: Sock, p: { code?: unknown } & Partial<DrawEvent>) {
    const room = this.getRoom(p.code);
    const g = room.game;
    if (!g || room.status !== 'playing') throw new AppError('INVALID_ACTION');
    const canvas = this.deps.engines[g.gameId].canvas?.(g.state);
    if (!canvas || canvas.drawer !== user.id) throw new AppError('FORBIDDEN', 'مش دورك بالرسم.');
    if (p.turnKey !== canvas.turnKey) throw new AppError('STALE_ACTION');
    if (room.drawing.turnKey !== canvas.turnKey) room.drawing = { turnKey: canvas.turnKey, segments: [], points: 0 };
    let ev: DrawEvent;
    if (p.op === 'clear') {
      room.drawing.segments = [];
      room.drawing.points = 0;
      ev = { turnKey: canvas.turnKey, op: 'clear' };
    } else if (p.op === 'undo') {
      const last = room.drawing.segments.at(-1)?.s;
      if (last == null) return;
      room.drawing.segments = room.drawing.segments.filter((s) => s.s !== last);
      room.drawing.points = room.drawing.segments.reduce((a, s) => a + s.p.length, 0);
      ev = { turnKey: canvas.turnKey, op: 'undo' };
    } else if (p.op === 'seg') {
      const seg = validateSegment(p.seg);
      if (room.drawing.segments.length >= MAX_SEGMENTS || room.drawing.points + seg.p.length > MAX_POINTS) throw new AppError('RATE_LIMITED', 'الرسمة كبرت كثير! امسح شوي.');
      room.drawing.segments.push(seg);
      room.drawing.points += seg.p.length;
      ev = { turnKey: canvas.turnKey, op: 'seg', seg };
    } else throw new AppError('VALIDATION');
    socket.to(this.channel(room)).emit('draw:event', ev);
  }

  drawSync(userId: string, rawCode: unknown) {
    const room = this.getRoom(rawCode);
    this.requireMember(room, userId);
    const g = room.game;
    const canvas = g ? this.deps.engines[g.gameId].canvas?.(g.state) : null;
    if (!canvas || room.drawing.turnKey !== canvas.turnKey) return { turnKey: canvas?.turnKey ?? '', segments: [] };
    return { turnKey: room.drawing.turnKey, segments: room.drawing.segments };
  }

  // -------------------------------------------------------------------------
  // views & broadcast
  // -------------------------------------------------------------------------
  private channel(room: Room) {
    return `room:${room.code}`;
  }

  viewFor(room: Room, viewerId: string): RoomView {
    const g = room.game;
    const now = this.now();
    const members: MemberView[] = [...room.members.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        avatarUrl: m.avatarUrl,
        isGuest: m.isGuest,
        level: m.level,
        ready: m.ready,
        connected: m.sockets.size > 0,
        isHost: m.id === room.hostId,
        team: m.team,
        inGame: !!g && room.status === 'playing' && g.state.players.includes(m.id),
        joinedAt: m.joinedAt,
      }));
    return {
      id: room.id,
      code: room.code,
      version: room.version,
      hostId: room.hostId,
      visibility: room.visibility,
      capacity: room.capacity,
      name: room.name,
      selectedGame: room.selectedGame,
      settings: room.settingsByGame[room.selectedGame] ?? sanitizeSettings(room.selectedGame, {}),
      status: room.status,
      members,
      you: viewerId,
      game: g ? (this.deps.engines[g.gameId].view(g.state, viewerId, now) as unknown as RoomView['game']) : null,
      matchNumber: room.matchNumber,
      createdAt: room.createdAt,
      awards: room.awards[viewerId] ?? null,
      voiceAvailable: this.deps.voiceAvailable,
      packId: room.packByGame[room.selectedGame] ?? null,
    };
  }

  /** Record activity, bump version, broadcast personalized views and persist. */
  private touch(room: Room) {
    room.version += 1;
    room.lastActivity = this.now();
    this.broadcast(room);
    this.persist(room);
  }

  private broadcast(room: Room) {
    for (const m of room.members.values()) {
      if (!m.sockets.size) continue;
      const view = this.viewFor(room, m.id);
      for (const sid of m.sockets) this.deps.io.to(sid).emit('room:state', view);
    }
  }

  getView(userId: string, rawCode: unknown): RoomView {
    const room = this.getRoom(rawCode);
    this.requireMember(room, userId);
    return this.viewFor(room, userId);
  }

  listPublic(): PublicRoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => !r.closed && r.visibility === 'public' && r.members.size > 0 && r.members.size < r.capacity)
      .sort((a, b) => (a.status === 'lobby' ? 0 : 1) - (b.status === 'lobby' ? 0 : 1) || b.members.size - a.members.size)
      .slice(0, 50)
      .map((r) => {
        const host = r.members.get(r.hostId);
        return { code: r.code, name: r.name, gameId: r.selectedGame, players: r.members.size, capacity: r.capacity, status: r.status, host: { name: host?.name ?? '', avatar: host?.avatar ?? '0-0' } };
      });
  }

  async quickPlay(user: UserRow, gameId?: unknown): Promise<{ code: string }> {
    const wanted = isGameId(gameId) ? gameId : null;
    const candidates = [...this.rooms.values()].filter(
      (r) => !r.closed && r.visibility === 'public' && r.status === 'lobby' && r.members.size > 0 && r.members.size < r.capacity && !r.kicked.has(user.id) && (!wanted || r.selectedGame === wanted),
    );
    const mine = candidates.find((r) => r.members.has(user.id));
    if (mine) return { code: mine.code };
    candidates.sort((a, b) => b.members.size - a.members.size);
    if (candidates[0]) return { code: candidates[0].code };
    return this.create(user, { visibility: 'public', gameId: wanted ?? 'outsider-word', capacity: 8, name: 'لعب سريع ⚡' });
  }

  stats() {
    let players = 0;
    let online = 0;
    let playing = 0;
    for (const r of this.rooms.values()) {
      players += r.members.size;
      for (const m of r.members.values()) if (m.sockets.size) online++;
      if (r.status === 'playing') playing++;
    }
    return { rooms: this.rooms.size, players, online, playing };
  }

  roomByCode(code: string) {
    return this.rooms.get(code) ?? null;
  }

  isMember(code: string, userId: string) {
    const r = this.rooms.get(code);
    return !!r && !r.closed && r.members.has(userId);
  }

  // -------------------------------------------------------------------------
  // lifecycle, persistence, recovery
  // -------------------------------------------------------------------------
  private async close(room: Room, reason: string) {
    if (room.closed) return;
    room.closed = true;
    this.clearTimer(room);
    this.rooms.delete(room.code);
    this.byId.delete(room.id);
    this.deps.io.to(this.channel(room)).emit('room:closed', { code: room.code, reason });
    const t = this.persistTimers.get(room.id);
    if (t) clearTimeout(t);
    this.persistTimers.delete(room.id);
    await this.deps.db.query(`update rooms set status = 'closed', closed_at = now(), snapshot = '{}'::jsonb where id = $1`, [room.id]).catch(() => {});
  }

  private persist(room: Room) {
    if (this.persistTimers.has(room.id)) return;
    const t = setTimeout(() => {
      this.persistTimers.delete(room.id);
      if (room.closed) return;
      void this.deps.db
        .query('update rooms set snapshot = $2::jsonb, version = $3, host_id = $4, visibility = $5, updated_at = now() where id = $1', [room.id, JSON.stringify(serialize(room)), room.version, room.hostId, room.visibility])
        .catch((e) => console.error('[rooms] persist failed', (e as Error).message));
    }, 300);
    t.unref?.();
    this.persistTimers.set(room.id, t);
  }

  async flush() {
    const pending = [...this.persistTimers.keys()];
    for (const id of pending) {
      clearTimeout(this.persistTimers.get(id)!);
      this.persistTimers.delete(id);
      const room = this.byId.get(id);
      if (room && !room.closed)
        await this.deps.db.query('update rooms set snapshot = $2::jsonb, version = $3, host_id = $4, visibility = $5, updated_at = now() where id = $1', [room.id, JSON.stringify(serialize(room)), room.version, room.hostId, room.visibility]);
    }
  }

  /** Restore open rooms after a restart; members reconnect via room:join. */
  async restore(): Promise<number> {
    const r = await this.deps.db.query<{ id: string; code: string; snapshot: SerializedRoom; updated_at: string }>(
      `select id, code, snapshot, updated_at from rooms where status = 'open'`,
      [],
    );
    let restored = 0;
    const cutoff = this.now() - this.deps.idleMinutes * 60_000;
    for (const row of r.rows) {
      const snap = row.snapshot;
      if (!snap || !snap.code || new Date(row.updated_at).getTime() < cutoff || !snap.members?.length) {
        await this.deps.db.query(`update rooms set status = 'closed', closed_at = now() where id = $1`, [row.id]);
        continue;
      }
      const room = deserialize(snap);
      this.rooms.set(room.code, room);
      this.byId.set(room.id, room);
      if (room.status === 'playing') this.schedule(room);
      restored++;
    }
    return restored;
  }

  private async sweep() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      await this.withLock(room, async () => {
        const members = [...room.members.values()];
        const anyOnline = members.some((m) => m.sockets.size > 0);
        if (!anyOnline && now - room.lastActivity > this.deps.idleMinutes * 60_000) return this.close(room, 'expired');
        // host migration when the host is gone for a while but others are here
        const host = room.members.get(room.hostId);
        if (anyOnline && host && host.sockets.size === 0 && host.disconnectedAt && now - host.disconnectedAt > HOST_GRACE_MS) {
          this.migrateHost(room);
          this.touch(room);
        }
        // forget long-disconnected members while not in an active game
        for (const m of members) {
          if (m.sockets.size === 0 && m.disconnectedAt && now - m.disconnectedAt > DISCONNECTED_MEMBER_TTL_MS && room.status !== 'playing') {
            await this.removeMember(room, m.id, 'expired');
            if (room.closed) return;
          }
        }
      }).catch(() => {});
    }
    for (const [uid, req] of this.createRequests) if (now - req.at > 10 * 60_000) this.createRequests.delete(uid);
  }

  async shutdown() {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) this.clearTimer(room);
    await this.flush();
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function validateSegment(raw: unknown): DrawSegment {
  const s = raw as DrawSegment;
  if (!s || typeof s !== 'object') throw new AppError('VALIDATION');
  if (!Number.isInteger(s.s) || s.s < 0 || s.s > 1e6) throw new AppError('VALIDATION');
  if (!Number.isInteger(s.c) || s.c < 0 || s.c > 15) throw new AppError('VALIDATION');
  if (!Number.isInteger(s.w) || s.w < 0 || s.w > 4) throw new AppError('VALIDATION');
  if (!Array.isArray(s.p) || s.p.length < 2 || s.p.length > 400 || s.p.length % 2) throw new AppError('VALIDATION');
  for (const v of s.p) if (!Number.isInteger(v) || v < 0 || v > 1000) throw new AppError('VALIDATION');
  return { s: s.s, c: s.c, w: s.w, p: s.p, ...(s.e ? { e: 1 as const } : {}) };
}

interface SerializedRoom {
  id: string;
  code: string;
  name: string;
  hostId: string;
  visibility: Room['visibility'];
  capacity: number;
  createdAt: number;
  lastActivity: number;
  members: Omit<Member, 'sockets'>[];
  kicked: string[];
  selectedGame: GameId;
  settingsByGame: Room['settingsByGame'];
  packByGame: Room['packByGame'];
  status: Room['status'];
  game: GameSession | null;
  version: number;
  matchNumber: number;
  chat: ChatMessage[];
  usedContent: Room['usedContent'];
  awards: Room['awards'];
}

function serialize(r: Room): SerializedRoom {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    hostId: r.hostId,
    visibility: r.visibility,
    capacity: r.capacity,
    createdAt: r.createdAt,
    lastActivity: r.lastActivity,
    members: [...r.members.values()].map(({ sockets: _s, ...m }) => m),
    kicked: [...r.kicked],
    selectedGame: r.selectedGame,
    settingsByGame: r.settingsByGame,
    packByGame: r.packByGame,
    status: r.status,
    game: r.game,
    version: r.version,
    matchNumber: r.matchNumber,
    chat: r.chat.slice(-30),
    usedContent: r.usedContent,
    awards: r.awards,
  };
}

function deserialize(s: SerializedRoom): Room {
  const now = Date.now();
  return {
    ...s,
    members: new Map(s.members.map((m) => [m.id, { ...m, sockets: new Set<string>(), disconnectedAt: m.disconnectedAt ?? now }])),
    kicked: new Set(s.kicked),
    version: s.version + 1,
    recentActions: [],
    recentActionSet: new Set(),
    drawing: { turnKey: '', segments: [], points: 0 },
    chatIds: new Set(),
    lastChat: new Map(),
    timer: null,
    lock: Promise.resolve(),
    closed: false,
  };
}
