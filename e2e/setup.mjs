import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';

export const hosts = {
  dev: 'http://127.0.0.1:4177',
  production: 'http://127.0.0.1:4178',
};

const repo = fileURLToPath(new URL('../', import.meta.url));
const runPnpm = (...args) => execFileSync('pnpm', args, {
  cwd: repo,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

function listenOptions(url) {
  const { hostname, port } = new URL(url);
  return { host: hostname, port: Number(port), strictPort: true };
}

export default async function setup() {
  runPnpm('build');
  const temporary = await mkdtemp(join(await realpath(tmpdir()), 'wav-recorder-e2e-'));
  const consumer = join(temporary, 'consumer');
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
      await rm(temporary, { recursive: true, force: true });
    }
  }

  try {
    await cp(join(repo, 'e2e', 'consumer'), consumer, { recursive: true });
    runPnpm('pack', '--pack-destination', temporary);
    const tarball = (await readdir(temporary)).find((name) => name.endsWith('.tgz'));
    if (!tarball) throw new Error('pnpm pack did not produce a tarball.');

    const modules = join(consumer, 'node_modules');
    const installedPackage = join(modules, 'react-use-wav-audio-recorder');
    await mkdir(installedPackage, { recursive: true });
    execFileSync('tar', ['-xf', join(temporary, tarball), '-C', installedPackage, '--strip-components=1']);
    for (const peer of ['react', 'react-dom']) {
      await symlink(join(repo, 'node_modules', peer), join(modules, peer), 'junction');
    }

    const config = { root: consumer, configFile: join(consumer, 'vite.config.mjs') };
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
