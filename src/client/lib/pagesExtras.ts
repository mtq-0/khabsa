import type { ComponentType } from 'react';

/**
 * Server edition: no extra UI. The GitHub Pages build swaps this module for
 * src/client/p2p/extras.ts, which provides the host status badge.
 */
export const loadHostBadge: (() => Promise<{ default: ComponentType<{ code: string }> }>) | null = null;
