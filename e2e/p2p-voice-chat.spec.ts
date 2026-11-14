import { test } from '@playwright/test';
import { checkP2pVoice, checkRelayVoice } from './voiceCheck.ts';

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
  permissions: ['microphone'],
});

// the server runs WITHOUT LiveKit here, which is exactly the free Render setup: voice falls back to peer to peer
test('server edition without LiveKit: voice chat works peer to peer (room link relays who is in voice)', async ({ browser }) => {
  await checkP2pVoice(browser, { createUrl: '/create', roomUrl: (host) => host.url() });
});

test('server edition: a player on a network that blocks direct connections still hears and is heard (audio through the server)', async ({ browser }) => {
  await checkRelayVoice(browser, { createUrl: '/create', roomUrl: (host) => host.url() });
});
