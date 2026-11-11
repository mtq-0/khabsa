/**
 * Server edition: every API call goes to the server, so nothing is handled
 * locally. (The GitHub Pages build swaps this for src/client/p2p/localApi.ts.)
 */
export function localApi(_path: string, _opts: { method: string; body?: unknown }): Promise<unknown> | undefined {
  return undefined;
}
