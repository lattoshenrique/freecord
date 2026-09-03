import { describe, expect, it } from 'vitest';
import {
  detectPlatform,
  guessOs,
  macArchFromRenderer,
  type PlatformProbe,
} from '../src/lib/platform';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const probe = (over: Partial<PlatformProbe>): PlatformProbe => ({
  userAgent: CHROME_MAC,
  uaData: null,
  maxTouchPoints: 0,
  renderer: () => null,
  ...over,
});

const uaData = (architecture: string, platform = 'macOS') => ({
  platform,
  mobile: false,
  getHighEntropyValues: async () => ({ architecture }),
});

describe('detectPlatform', () => {
  it('usa a arquitetura do Client Hints quando existe', async () => {
    expect(await detectPlatform(probe({ uaData: uaData('arm') }))).toEqual({
      os: 'mac',
      target: 'mac-arm64',
      confident: true,
    });
    expect(await detectPlatform(probe({ uaData: uaData('x86') }))).toEqual({
      os: 'mac',
      target: 'mac-x64',
      confident: true,
    });
  });

  it('no Safari cai no renderer do WebGL', async () => {
    // O UA do Mac diz "Intel" mesmo em Apple Silicon: só a GPU entrega.
    const apple = probe({ userAgent: SAFARI_MAC, renderer: () => 'Apple M3 Pro' });
    expect(await detectPlatform(apple)).toMatchObject({ target: 'mac-arm64', confident: true });

    const intel = probe({ userAgent: SAFARI_MAC, renderer: () => 'Intel(R) Iris(TM) Plus Graphics' });
    expect(await detectPlatform(intel)).toMatchObject({ target: 'mac-x64', confident: true });
  });

  it('sem sinal nenhum, chuta Apple Silicon e admite o chute', async () => {
    expect(await detectPlatform(probe({ userAgent: SAFARI_MAC }))).toEqual({
      os: 'mac',
      target: 'mac-arm64',
      confident: false,
    });
  });

  it('Client Hints que falha não derruba a detecção', async () => {
    const broken = probe({
      uaData: {
        platform: 'macOS',
        mobile: false,
        getHighEntropyValues: async () => {
          throw new Error('bloqueado');
        },
      },
      renderer: () => 'AMD Radeon Pro 5500M',
    });
    expect(await detectPlatform(broken)).toMatchObject({ target: 'mac-x64' });
  });

  it('identifica Windows e Linux', async () => {
    const win = probe({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0' });
    expect(await detectPlatform(win)).toEqual({ os: 'windows', target: 'windows-x64', confident: true });

    const linux = probe({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/142.0' });
    expect(await detectPlatform(linux)).toEqual({ os: 'linux', target: 'linux-appimage', confident: true });
  });

  it('celular não recebe binário de desktop', async () => {
    const android = probe({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile' });
    expect(await detectPlatform(android)).toMatchObject({ os: 'mobile', target: null });

    const iphone = probe({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1' });
    expect(await detectPlatform(iphone)).toMatchObject({ os: 'mobile', target: null });

    // iPad em modo desktop se diz Macintosh; o toque o denuncia.
    const ipad = probe({ userAgent: SAFARI_MAC, maxTouchPoints: 5 });
    expect(await detectPlatform(ipad)).toMatchObject({ os: 'mobile', target: null });
  });
});

describe('macArchFromRenderer', () => {
  it('não decide com renderer vazio ou mascarado', () => {
    expect(macArchFromRenderer(null)).toBeNull();
    expect(macArchFromRenderer('WebKit WebGL')).toBeNull();
  });

  it('GPU de terceiro ganha do prefixo Apple', () => {
    expect(macArchFromRenderer('Apple GPU (Intel HD Graphics 630)')).toBe('x64');
    expect(macArchFromRenderer('Apple GPU')).toBe('arm64');
  });
});

describe('guessOs', () => {
  it('responde na hora o mesmo sistema que detectPlatform', async () => {
    const cases = [
      probe({}),
      probe({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
      probe({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }),
      probe({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1' }),
      probe({ userAgent: 'Mozilla/5.0 (PlayStation 5)' }),
    ];
    for (const one of cases) {
      expect(guessOs(one)).toBe((await detectPlatform(one)).os);
    }
  });

  it('não toca no WebGL nem no Client Hints: o botão desenha no primeiro quadro', () => {
    let touched = false;
    const guess = guessOs(
      probe({
        renderer: () => {
          touched = true;
          return 'Apple M3';
        },
        uaData: {
          platform: 'macOS',
          mobile: false,
          getHighEntropyValues: () => {
            touched = true;
            return Promise.resolve({ architecture: 'arm' });
          },
        },
      }),
    );
    expect(guess).toBe('mac');
    expect(touched).toBe(false);
  });
});
