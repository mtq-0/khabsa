import type { ComponentType } from 'react';

/** GitHub Pages edition of lib/pagesExtras.ts. */
export const loadHostBadge: (() => Promise<{ default: ComponentType<{ code: string }> }>) | null = () => import('../room/HostBadge.tsx');
