import { build, createServer, preview } from 'vite';
import { prepareConsumer } from './consumer-env.mjs';

export const hosts = {
  dev: 'http://127.0.0.1:4177',
  production: 'http://127.0.0.1:4178',
};

function listenOptions(url) {
  const { hostname, port } = new URL(url);
  return { host: hostname, port: Number(port), strictPort: true };
}

export default async function setup() {
  const { config, cleanup: removeConsumer } = await prepareConsumer();
  let dev;
  let production;

  async function cleanup() {
    try {
      await Promise.all([
        dev?.close(),
        production && new Promise((done) => {
          production.httpServer.close(done);
          production.httpServer.closeAllConnections();
        }),
      ]);
    } finally {
      await removeConsumer();
    }
  }

  try {
    await build(config);
    production = await preview({ ...config, preview: listenOptions(hosts.production) });
    dev = await createServer({ ...config, server: { ...listenOptions(hosts.dev), hmr: false } });
    await dev.listen();
    await dev.warmupRequest('/main.jsx');
    await dev.waitForRequestsIdle();
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
