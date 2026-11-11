import { useEffect, useState } from 'react';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2, Signal } from 'lucide-react';
import type { RoomView } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { useVoice } from './voiceStore.ts';

type VoiceModule = typeof import('./voiceClient.ts');
let modPromise: Promise<VoiceModule> | null = null;
const loadVoice = () => (modPromise ??= import('./voiceClient.ts'));

/** Voice controls. Voice is optional and never blocks joining or playing. */
export function VoicePanel({ view }: { view: RoomView }) {
  const v = useVoice();
  const [mod, setMod] = useState<VoiceModule | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [showMixer, setShowMixer] = useState(false);

  // leave voice when leaving the room page
  useEffect(
    () => () => {
      void modPromise?.then((m) => m.leaveVoice());
    },
    [view.code],
  );

  if (!view.voiceAvailable)
    return (
      <div className="rounded-2xl bg-white/5 px-3 py-2 text-xs text-ink-400">
        🎙️ الصوت مش مفعّل على هالخادم. احكوا بالشات.
      </div>
    );

  const join = async () => {
    const m = await loadVoice();
    setMod(m);
    await m.joinVoice(view.code);
    setMics(await m.listMics());
  };

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
          {v.deafened ? 'أطرش' : 'سماع'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void mod?.leaveVoice()} icon={<PhoneOff className="size-4" />} aria-label="اطلع من الصوت" data-testid="voice-leave">
          اطلع
        </Button>
      </div>
      {v.error && <p className="text-xs text-zing-400">{v.error}</p>}
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
