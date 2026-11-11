/**
 * Build mode. The normal build talks to the KHABSA Node server.
 * The "pages" build (npm run build:pages) is a static site for GitHub Pages:
 * the host's browser runs the game server and friends connect peer-to-peer.
 */
export const PAGES = import.meta.env.VITE_KHABSA_PAGES === '1';
export const BASE = import.meta.env.BASE_URL || '/';

/** Absolute URL of a file in /public, respecting the deploy base path. */
export const asset = (path: string) => BASE + path.replace(/^\//, '');

/** Pages edition: does this browser host (run the server for) the room? */
export const isHostTab = (code: string) => PAGES && localStorage.getItem(`khabsa:p2p:hosting:${code}`) != null;

/** Shareable invitation link for a room. */
export function roomLink(code: string): string {
  return PAGES ? `${location.origin}${BASE}#/r/${code}` : `${location.origin}/r/${code}`;
}
