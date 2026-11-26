import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, browserName }) => {
  if (browserName === 'webkit') {
    // Use real audio nodes and encoding while bypassing the microphone permission prompt.
    await page.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
        value: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          await context.resume();
          return destination.stream;
        },
      });
    });
  }
  await page.goto('/');
});

test('reports invalid input and then records and converts a finalized WAV', async ({ page }) => {
  const status = page.getByRole('status');
  await page.getByRole('button', { name: 'Convert invalid WAV' }).click();
  await expect(status).toContainText('Invalid WAV');

  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect.poll(async () => ({
    state: await status.textContent(),
    canStop: await stop.isEnabled(),
  })).toEqual({ state: 'Starting recording', canStop: true });
  // Give the input stream time to collect enough PCM samples for multiple MP3 frames.
  await page.waitForTimeout(750);
  await stop.click();
  await expect(status).toHaveText('Converted WAV to MP3');
});
