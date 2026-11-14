import { expect, test } from '@playwright/test';
import { checkP2pVoice, checkRelayVoice } from './voiceCheck.ts';

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
  permissions: ['microphone'],
});

test('GitHub Pages edition: peer-to-peer voice chat, three players joining at different times, everybody hears everybody', async ({ browser }) => {
  await checkP2pVoice(browser, {
    createUrl: '#/create',
    roomUrl: (host) => host.url(),
    hostOnline: (host) => expect(host.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 }),
  });
});

test('GitHub Pages edition: a player on a network that blocks direct connections still hears and is heard (audio through the host)', async ({ browser }) => {
  await checkRelayVoice(browser, {
    createUrl: '#/create',
    roomUrl: (host) => host.url(),
    hostOnline: (host) => expect(host.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 }),
  });
});
