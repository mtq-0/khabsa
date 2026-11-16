import { useEffect, useState } from 'react';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2, Signal } from 'lucide-react';
import type { RoomView } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { PAGES } from '../lib/mode.ts';
import { useVoice } from './voiceStore.ts';

type VoiceModule = typeof import('./voiceClient.ts') & Partial<typeof import('./voiceP2p.ts')>;
let modPromise: Promise<VoiceModule> | null = null;
/**
 * LiveKit (SFU, best for bigger rooms) when the server has it configured; otherwise a small
 * peer-to-peer mesh that needs no server at all (also what the GitHub Pages edition uses).
 */
const loadVoice = (p2p: boolean) => (modPromise ??= p2p ? import('./voiceP2p.ts') : import('./voiceClient.ts'));
/** the loaded voice module, shared by every VoicePanel on the page (the room shows one per tab on phones) */
let loadedMod: VoiceModule | null = null;

/** Voice controls. Voice is optional and never blocks joining or playing. */
export function VoicePanel({ view, compact = false }: { view: RoomView; compact?: boolean }) {
  const v = useVoice();
  // every panel uses the same voice module: the mic button works in whichever panel you press,
  // also after the panel was re-mounted (switching tabs, the game starting)
  const [mod, setMod] = useState<VoiceModule | null>(loadedMod);
  useEffect(() => {
    if (!mod && modPromise) void modPromise.then((m) => setMod((loadedMod = m)));
  }, [mod, v.status]);
  useEffect(() => {
    if (mod && v.status === 'connected') void mod.listMics().then(setMics).catch(() => {});
  }, [mod, v.status]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [showMixer, setShowMixer] = useState(false);
  const p2p = PAGES || !view.voiceAvailable;

  // leave voice when leaving the room page
  useEffect(
    () => () => {
      void modPromise?.then((m) => m.leaveVoice());
    },
    [view.code],
  );

  const memberIds = view.members.map((m) => m.id).join(',');
  useEffect(() => {
    if (p2p) void modPromise?.then((m) => m.syncMembers?.(memberIds ? memberIds.split(',') : []));
  }, [memberIds, mod]);

  const join = async () => {
    const m = await loadVoice(p2p);
    setMod((loadedMod = m));
    await (m.joinVoice as (c: string, ids?: string[], me?: string) => Promise<void>)(view.code, view.members.map((x) => x.id), view.you);
    setMics(await m.listMics());
  };

  // compact: icon-only controls for the tabs row on phones while a game is running
  if (compact) {
    if (v.status === 'off' || v.status === 'error')
      return (
        <button type="button" className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt-400/15 text-volt-300 transition hover:bg-volt-400/25" onClick={() => void join()} aria-label="انضم للصوت" title="انضم للصوت" data-testid="voice-join">
          <Mic className="size-5" />
        </button>
      );
    const live = v.status === 'connected';
    return (
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={cx('grid size-10 place-items-center rounded-xl transition', v.muted ? 'bg-zing-500/20 text-zing-400' : live ? 'bg-lime-400/15 text-lime-400' : 'bg-sun-400/15 text-sun-400')}
          onClick={() => void mod?.setMuted(!v.muted)}
          aria-pressed={v.muted}
          aria-label={v.muted ? 'شغّل المايك' : 'سكّر المايك'}
        >
          {v.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </button>
        <button type="button" className="grid size-10 place-items-center rounded-xl bg-white/5 text-ink-300 hover:text-white" onClick={() => void mod?.leaveVoice()} aria-label="اطلع من الصوت" data-testid="voice-leave">
          <PhoneOff className="size-5" />
        </button>
      </div>
    );
  }

  if (v.status === 'off' || v.status === 'error')
    return (
      <div className="space-y-2">
        <Button className="w-full" variant="volt" icon={<Mic className="size-4" />} onClick={() => void join()} data-testid="voice-join">
          انضم للصوت
        </Button>
        {v.error && <p className="text-xs text-zing-400">{v.error}</p>}
      </div>
    );

  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className={cx('flex items-center gap-1.5 font-semibold', v.status === 'connected' ? 'text-lime-400' : 'text-sun-400')}>
          <Signal className="size-3.5" />
          {v.status === 'connected' ? `بالصوت (${Object.keys(v.inVoice).length})` : v.status === 'connecting' ? 'عم نتصل...' : 'عم نرجع نتصل...'}
        </span>
        <button className="text-ink-400 hover:text-white" onClick={() => setShowMixer((x) => !x)}>
          <Volume2 className="inline size-4" /> الأصوات
        </button>
      </div>
      {v.needsAudioUnlock && (
        <Button size="sm" className="w-full" onClick={() => void mod?.unlockAudio()}>
          🔊 اكبس لتسمع الباقي
        </Button>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant={v.muted ? 'danger' : 'secondary'} onClick={() => void mod?.setMuted(!v.muted)} aria-pressed={v.muted} icon={v.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}>
          {v.muted ? 'مسكّر' : 'مايك'}
        </Button>
        <Button size="sm" variant={v.deafened ? 'danger' : 'secondary'} onClick={() => mod?.setDeafened(!v.deafened)} aria-pressed={v.deafened} icon={v.deafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}>
          {v.deafened ? 'مش سامع' : 'سماع'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void mod?.leaveVoice()} icon={<PhoneOff className="size-4" />} aria-label="اطلع من الصوت" data-testid="voice-leave">
          اطلع
        </Button>
      </div>
      {v.error && <p className="text-xs text-zing-400">{v.error}</p>}
      {(() => {
        const names = (st: string) => view.members.filter((m) => v.peerState[m.id] === st).map((m) => m.name).join('، ');
        const connecting = names('connecting');
        const relay = names('relay');
        return (
          <>
            {connecting && (
              <p className="text-xs text-ink-400" data-testid="voice-connecting">
                عم نوصل الصوت مع {connecting}...
              </p>
            )}
            {relay && (
              <p className="text-xs text-ink-400" data-testid="voice-relay">
                الصوت مع {relay} ماشي عبر الخادم (الشبكة بتمنع الاتصال المباشر). شغّال، بس الجودة أقل شوي.
              </p>
            )}
          </>
        );
      })()}
      {showMixer && (
        <div className="space-y-2 pt-1">
          {mics.length > 1 && (
            <select className="field py-2 text-sm" defaultValue={mod?.activeMic() ?? ''} onChange={(e) => void mod?.switchMic(e.target.value)} aria-label="المايك">
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || 'مايك'}
                </option>
              ))}
            </select>
          )}
          {view.members
            .filter((m) => m.id !== view.you && v.inVoice[m.id])
            .map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate">{m.name}</span>
                <input type="range" min={0} max={1} step={0.05} value={v.volumes[m.id] ?? 1} onChange={(e) => mod?.setVolume(m.id, Number(e.target.value))} className="flex-1 accent-volt-400" aria-label={`صوت ${m.name}`} />
              </label>
            ))}
        </div>
      )}
    </div>
  );
}
