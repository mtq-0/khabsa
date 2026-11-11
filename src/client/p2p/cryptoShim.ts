/** Browser replacement for the two node:crypto functions RoomManager uses. */
export function randomUUID(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Unbiased random integer in [0, max). */
export function randomInt(max: number): number {
  const a = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do globalThis.crypto.getRandomValues(a);
  while (a[0] >= limit);
  return a[0] % max;
}
