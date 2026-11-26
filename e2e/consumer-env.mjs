import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = fileURLToPath(new URL('../', import.meta.url));

function runPnpm(...args) {
  execFileSync('pnpm', args, {
    cwd: repo,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

export async function prepareConsumer() {
  runPnpm('build');
  const temporary = await mkdtemp(join(await realpath(tmpdir()), 'wav-recorder-e2e-'));
  const consumer = join(temporary, 'consumer');
  const cleanup = () => rm(temporary, { recursive: true, force: true });

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

    return { config: { root: consumer, configFile: join(consumer, 'vite.config.mjs') }, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
