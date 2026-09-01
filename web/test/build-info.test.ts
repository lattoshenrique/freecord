import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_BUILD, APP_VERSION } from '../src/lib/build-info';

describe('build info', () => {
  it('carries the package version into the bundle', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8')) as {
      version: string;
    };
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('stamps a non-empty build id', () => {
    // A commit hash in a checkout ('abc1234', '+' when dirty), 'nogit'
    // outside one — never an empty string and never the raw identifier.
    expect(APP_BUILD.length).toBeGreaterThan(0);
    expect(APP_BUILD).not.toContain('__APP_BUILD__');
  });
});
