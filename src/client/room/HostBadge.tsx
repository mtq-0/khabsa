import { useHubStatus, isHosting } from '../p2p/host.ts';
import { cx } from '../components/ui.tsx';

/**
 * GitHub Pages edition: tells the host whether friends can reach the room
 * and reminds them that this tab is the game server.
 */
export default function HostBadge({ code }: { code: string }) {
  const { state, message, guests } = useHubStatus();
  if (!isHosting(code)) return null;
  const tone = state === 'online' ? 'border-lime-400/30 text-lime-400' : state === 'error' ? 'border-zing-500/40 text-zing-400' : 'border-sun-400/30 text-sun-400';
  return (
    <div className={cx('card flex flex-wrap items-center gap-2 border px-4 py-2 text-sm', tone)} role="status" data-testid="host-badge" data-state={state}>
      <span className={cx('size-2.5 rounded-full', state === 'online' ? 'bg-lime-400' : state === 'error' ? 'bg-zing-500' : 'animate-pulse bg-sun-400')} />
      {state === 'online' ? `الغرفة جاهزة لأصحابك · متصلين: ${guests}` : state === 'error' ? (message ?? 'مشكلة بالاتصال') : 'عم نجهّز الغرفة لأصحابك...'}
      <span className="ms-auto text-xs text-ink-400">إنت السيرفر: خلّي هالصفحة مفتوحة 🖥️</span>
    </div>
  );
}
