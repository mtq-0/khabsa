/**
 * Error codes shared by server and client. Every failure the player can see
 * maps to exactly one of these so the UI never confuses, for example,
 * "room not found" with "network failure".
 */
export const ERROR_CODES = [
  'ROOM_NOT_FOUND',
  'INVALID_CODE',
  'ROOM_FULL',
  'ROOM_CLOSED',
  'KICKED',
  'FORBIDDEN',
  'NOT_HOST',
  'NOT_MEMBER',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'VALIDATION',
  'STALE_ACTION',
  'INVALID_ACTION',
  'GAME_DISABLED',
  'NOT_ENOUGH_PLAYERS',
  'TOO_MANY_PLAYERS',
  'RATE_LIMITED',
  'CONFLICT',
  'NOT_FOUND',
  'VOICE_NOT_CONFIGURED',
  'SERVER_ERROR',
  // client-side only
  'NETWORK',
  'TIMEOUT',
  'REALTIME_FAILED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES_AR: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: 'ما لقينا غرفة بهالرمز. تأكد من الرمز أو اطلب رابط جديد.',
  INVALID_CODE: 'رمز الغرفة لازم يكون 6 أحرف أو أرقام إنجليزية.',
  ROOM_FULL: 'الغرفة مليانة. جرّب غرفة ثانية أو اطلب من المضيف يكبّرها.',
  ROOM_CLOSED: 'الغرفة انسكرت.',
  KICKED: 'المضيف طلّعك من هالغرفة.',
  FORBIDDEN: 'ما عندك صلاحية لهالإجراء.',
  NOT_HOST: 'هالإجراء للمضيف بس.',
  NOT_MEMBER: 'لازم تكون داخل الغرفة.',
  UNAUTHENTICATED: 'لازم تدخل باسم أو حساب أول.',
  SESSION_EXPIRED: 'جلستك انتهت. ادخل مرة ثانية.',
  VALIDATION: 'في معلومات ناقصة أو غلط.',
  STALE_ACTION: 'اللعبة انتقلت لمرحلة ثانية قبل ما يوصل طلبك.',
  INVALID_ACTION: 'هالحركة مش مسموحة هلأ.',
  GAME_DISABLED: 'هاللعبة متوقفة مؤقتاً.',
  NOT_ENOUGH_PLAYERS: 'عدد اللاعبين قليل لهاللعبة.',
  TOO_MANY_PLAYERS: 'عدد اللاعبين أكثر من المسموح لهاللعبة.',
  RATE_LIMITED: 'شوي شوي! استنى لحظة وجرّب.',
  CONFLICT: 'العملية متعارضة مع حالة حالية.',
  NOT_FOUND: 'مش موجود.',
  VOICE_NOT_CONFIGURED: 'الدردشة الصوتية مش مفعّلة على هالخادم.',
  SERVER_ERROR: 'صار خطأ بالخادم. جرّب كمان شوي.',
  NETWORK: 'في مشكلة بالاتصال بالإنترنت. الغرفة ممكن تكون موجودة، جرّب مرة ثانية.',
  TIMEOUT: 'الخادم تأخر بالرد. جرّب مرة ثانية.',
  REALTIME_FAILED: 'انقطع الاتصال المباشر. عم نحاول نرجع...',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? ERROR_MESSAGES_AR[code]);
    this.code = code;
    this.details = details;
    this.status = statusFor(code);
  }
}

function statusFor(code: ErrorCode): number {
  switch (code) {
    case 'ROOM_NOT_FOUND':
    case 'NOT_FOUND':
      return 404;
    case 'INVALID_CODE':
    case 'VALIDATION':
    case 'INVALID_ACTION':
    case 'NOT_ENOUGH_PLAYERS':
    case 'TOO_MANY_PLAYERS':
      return 400;
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return 401;
    case 'FORBIDDEN':
    case 'NOT_HOST':
    case 'NOT_MEMBER':
    case 'KICKED':
    case 'GAME_DISABLED':
      return 403;
    case 'ROOM_FULL':
    case 'ROOM_CLOSED':
    case 'CONFLICT':
    case 'STALE_ACTION':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'VOICE_NOT_CONFIGURED':
      return 503;
    default:
      return 500;
  }
}

export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };
