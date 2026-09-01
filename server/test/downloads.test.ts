import { describe, expect, it } from 'vitest';
import {
  DESKTOP_BUILDS,
  buildDesktopCatalog,
  desktopDownloadUrl,
  findDesktopBuild,
} from '../src/domain/downloads.js';

describe('desktop app catalog', () => {
  it('offers nothing when no release is published', () => {
    const catalog = buildDesktopCatalog(null);
    expect(catalog.builds).toEqual([]);
    expect(catalog.version).toBeNull();
  });

  it('only offers builds whose asset exists in the release', () => {
    const catalog = buildDesktopCatalog({
      tag_name: 'desktop-v1.2.0',
      published_at: '2026-09-01T12:00:00Z',
      assets: [
        { name: 'freecord-mac-arm64.dmg', size: 104857600 },
        { name: 'freecord-win-x64.exe', size: 83886080 },
        { name: 'ruido.txt', size: 1 },
      ],
    });
    expect(catalog.builds.map((build) => build.target)).toEqual(['mac-arm64', 'windows-x64']);
    expect(catalog.version).toBe('1.2.0');
    expect(catalog.builds[0]?.size).toBe(104857600);
  });

  it('links to latest, not to the tag it read', () => {
    // This is what keeps a stale cached catalog usable.
    const catalog = buildDesktopCatalog({
      tag_name: 'desktop-v0.1.0',
      assets: [{ name: 'freecord-linux-amd64.deb', size: 90000000 }],
    });
    expect(catalog.builds[0]?.url).toContain('/releases/latest/download/freecord-linux-amd64.deb');
    expect(catalog.builds[0]?.url).not.toContain('0.1.0');
  });

  it('tolerates a release with no assets and no tag', () => {
    const catalog = buildDesktopCatalog({});
    expect(catalog.builds).toEqual([]);
    expect(catalog.version).toBeNull();
    expect(catalog.publishedAt).toBeNull();
  });

  it('every target has a unique file and resolves in the short redirect', () => {
    const files = new Set(DESKTOP_BUILDS.map((build) => build.file));
    expect(files.size).toBe(DESKTOP_BUILDS.length);
    for (const build of DESKTOP_BUILDS) {
      expect(findDesktopBuild(build.target)).toBe(build);
      expect(desktopDownloadUrl(build.file)).toContain(build.file);
    }
    expect(findDesktopBuild('bsd-vax')).toBeUndefined();
  });
});
