import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: new URL('.', import.meta.url), encoding: 'utf8', timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return 'local'; }
}

export default defineConfig({
  // Relative URLs support both a project subdirectory and an ordinary static host.
  base: process.env.BASE_PATH ?? './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
});
