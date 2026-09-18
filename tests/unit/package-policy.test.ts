import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageMetadata {
  name: string;
  version: string;
  engines: { node: string };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageMetadata;
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, PackageMetadata>;
};

describe('package and lockfile policy', () => {
  it('keeps the supported Node range synchronized in the lockfile root', () => {
    expect(lock.packages['']?.engines).toEqual(manifest.engines);
  });

  it('keeps direct dependency pins synchronized without resolving new versions', () => {
    expect(lock.packages['']?.dependencies).toEqual(manifest.dependencies);
    expect(lock.packages['']?.devDependencies).toEqual(manifest.devDependencies);
  });

  it('keeps the package identity synchronized', () => {
    expect(lock.packages['']?.name).toBe(manifest.name);
    expect(lock.packages['']?.version).toBe(manifest.version);
  });
});
