import { describe, expect, it } from 'vitest';
import { installState, manualRoute } from '../src/lib/pwa';

/**
 * The install offer's two decisions, tested without a browser — the same
 * shape platform.test.ts uses, and for the same reason: what these get wrong
 * is a person shown the wrong way to install, on a device nobody here has.
 */

describe('installState', () => {
  it('says nothing to an app that is already installed', () => {
    expect(installState({ standalone: true, prompted: false, mobile: true })).toBe('installed');
    // Even holding a live event: the window it would install into is this one.
    expect(installState({ standalone: true, prompted: true, mobile: true })).toBe('installed');
  });

  it('prefers the browser prompt wherever it is offered', () => {
    expect(installState({ standalone: false, prompted: true, mobile: true })).toBe('prompt');
    expect(installState({ standalone: false, prompted: true, mobile: false })).toBe('prompt');
  });

  it('falls back to instructions on a phone that never fires the event', () => {
    // Every browser on iOS, and some on Android: installable, but only
    // through a menu this page is not allowed to open.
    expect(installState({ standalone: false, prompted: false, mobile: true })).toBe('manual');
  });

  it('offers nothing on a desktop browser that did not ask', () => {
    // A computer has the desktop build for this; silence beats a dead end.
    expect(installState({ standalone: false, prompted: false, mobile: false })).toBe(
      'unavailable',
    );
  });
});

describe('manualRoute', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const IPAD_DESKTOP_MODE =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  it('sends iOS to the Share sheet', () => {
    expect(manualRoute({ userAgent: IPHONE })).toBe('ios');
  });

  it('sees through an iPad claiming to be a Mac', () => {
    // Same tell lib/platform.ts uses: a Macintosh with a touch screen is a
    // tablet, and a tablet installs from the Share sheet.
    expect(manualRoute({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 })).toBe('ios');
  });

  it('leaves a real Mac on the browser menu', () => {
    expect(manualRoute({ userAgent: MAC, maxTouchPoints: 0 })).toBe('menu');
    // No touch reading at all is not a reason to guess iOS.
    expect(manualRoute({ userAgent: MAC })).toBe('menu');
  });

  it('sends everything else to the browser menu', () => {
    expect(manualRoute({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe('menu');
  });
});
