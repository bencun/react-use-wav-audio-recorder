import { defineConfig } from '@playwright/test';
import { hosts } from './e2e/setup.mjs';

const browsers = {
  chromium: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  firefox: {
    firefoxUserPrefs: {
      'media.navigator.streams.fake': true,
      'media.navigator.permission.disabled': true,
    },
  },
  webkit: {},
};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.mjs',
  // Run one capture at a time to avoid contention between browser audio engines.
  workers: 1,
  projects: Object.entries(hosts).flatMap(([mode, baseURL]) =>
    Object.entries(browsers).map(([browserName, launchOptions]) => ({
      name: `${browserName}-${mode}`,
      use: { browserName, baseURL, launchOptions },
    })),
  ),
  globalSetup: './e2e/setup.mjs',
});
