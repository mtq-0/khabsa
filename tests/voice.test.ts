import { describe, expect, it } from 'vitest';
import { FRAME_SAMPLES, RELAY_RATE, decodeFrame, encodeFrame, muLawDecode, muLawEncode, resample } from '../src/client/voice/relayAudio.ts';
import { IceService, cleanIceServers, iceConfigFromEnv } from '../src/server/voice/ice.ts';

describe('voice relay codec (G.711 μ-law)', () => {
  it('round-trips speech-level samples with telephone accuracy', () => {
    for (const v of [0, 0.001, -0.002, 0.01, -0.05, 0.1, -0.3, 0.5, -0.8, 0.99, -1]) {
      const back = muLawDecode(muLawEncode(v));
      expect(Math.abs(back - v)).toBeLessThanOrEqual(Math.max(0.002, Math.abs(v) * 0.07));
    }
    expect(muLawDecode(muLawEncode(5))).toBeCloseTo(muLawDecode(muLawEncode(1)), 5); // clipped, not wrapped
  });
  it('a 60 ms frame is one byte per sample and fits the server limit', () => {
    const tone = Float32Array.from({ length: FRAME_SAMPLES }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 440 * i) / RELAY_RATE));
    const b64 = encodeFrame(tone);
    expect(b64.length).toBeLessThanOrEqual(2400);
    expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/);
    const back = decodeFrame(b64);
    expect(back).toHaveLength(FRAME_SAMPLES);
    let err = 0;
    for (let i = 0; i < tone.length; i++) err = Math.max(err, Math.abs(back[i] - tone[i]));
    expect(err).toBeLessThan(0.03);
  });
  it('resamples 48 kHz / 44.1 kHz microphones to 16 kHz and back', () => {
    const one = new Float32Array(4800).fill(0.25);
    expect(resample(one, 48_000, 16_000)).toHaveLength(1600);
    expect(resample(new Float32Array(2048), 44_100, 16_000).length).toBe(Math.round((2048 * 16_000) / 44_100));
    expect(Array.from(resample(one, 48_000, 16_000)).every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
    expect(resample(Float32Array.from([0, 1]), 16_000, 32_000)).toHaveLength(4);
  });
});

describe('TURN relays for the voice mesh', () => {
  it('reads Cloudflare / Metered / static TURN from the environment and ignores half-configured ones', () => {
    expect(iceConfigFromEnv({})).toEqual({ cloudflare: null, metered: null, turn: null });
    const c = iceConfigFromEnv({ CLOUDFLARE_TURN_KEY_ID: 'kid', CLOUDFLARE_TURN_KEY_API_TOKEN: 'tok', METERED_DOMAIN: 'https://myapp.metered.live/', METERED_API_KEY: 'k', TURN_URLS: 'turn:a.example:3478, http://nope, turns:a.example:443', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' });
    expect(c.cloudflare).toEqual({ keyId: 'kid', token: 'tok' });
    expect(c.metered).toEqual({ domain: 'myapp.metered.live', apiKey: 'k' });
    expect(c.turn).toEqual({ urls: ['turn:a.example:3478', 'turns:a.example:443'], username: 'u', credential: 'p' });
    expect(iceConfigFromEnv({ CLOUDFLARE_TURN_KEY_ID: 'kid' }).cloudflare).toBeNull();
    expect(iceConfigFromEnv({ TURN_URLS: 'turn:x:1' }).turn).toBeNull();
  });
  it('cleans what a provider returns: keeps STUN/TURN urls, drops port 53 and junk', () => {
    expect(
      cleanIceServers([
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'javascript:alert(1)'], username: 'u', credential: 'c' },
        { urls: 'https://evil' },
        'x',
        null,
      ]),
    ).toEqual([{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' }]);
    expect(cleanIceServers({})).toEqual([]);
  });
  it('asks Cloudflare for short-lived credentials server-side, caches them, and never throws', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53'], username: 'user', credential: 'pass' }] }), { status: 201 });
    }) as unknown as typeof fetch;
    const svc = new IceService({ cloudflare: { keyId: 'K1', token: 'T1' }, metered: null, turn: null }, fake);
    const a = await svc.servers(1000);
    expect(a).toEqual([{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'user', credential: 'pass' }]);
    expect(calls[0].url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/K1/credentials/generate-ice-servers');
    expect((calls[0].init!.headers as Record<string, string>).authorization).toBe('Bearer T1');
    await svc.servers(2000);
    expect(calls).toHaveLength(1); // cached
    await svc.servers(1000 + 61 * 60_000);
    expect(calls).toHaveLength(2); // refreshed after an hour
    const broken = new IceService({ cloudflare: { keyId: 'K', token: 'T' }, metered: null, turn: { urls: ['turn:x.example:3478'], username: 'u', credential: 'c' } }, (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch);
    expect(await broken.servers()).toEqual([{ urls: ['turn:x.example:3478'], username: 'u', credential: 'c' }]); // static ones still work
    expect(await new IceService({ cloudflare: null, metered: null, turn: null }).servers()).toEqual([]);
  });
});
