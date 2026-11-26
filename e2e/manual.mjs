import { join } from 'node:path';
import { build, createServer } from 'vite';
import { prepareConsumer, repo } from './consumer-env.mjs';

const command = process.argv[2];
if (command !== 'dev' && command !== 'build') {
  throw new Error('Expected dev or build.');
}

const { config, cleanup } = await prepareConsumer();

if (command === 'build') {
  try {
    await build({ ...config, build: { outDir: join(repo, 'e2e', 'dist'), emptyOutDir: true } });
  } finally {
    await cleanup();
  }
} else {
  let server;
  try {
    server = await createServer({ ...config, server: { host: '127.0.0.1', port: 5173, hmr: false } });
    await server.listen();
    await server.warmupRequest('/main.jsx');
    await server.waitForRequestsIdle();
    server.printUrls();
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  } finally {
    try {
      await server?.close();
    } finally {
      await cleanup();
    }
  }
}
