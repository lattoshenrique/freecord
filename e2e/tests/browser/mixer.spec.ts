import { expect, test, type Page } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import {
  closeAll,
  joinMany,
  joinRoomPage,
  screenShareButton,
  type RoomPageHandle,
} from '../../helpers/pages';

/**
 * A display stream with program audio, without depending on Chromium's
 * headless capture picker. The real screen path still carries it over the
 * room's WebRTC mesh; only the device at the entrance is deterministic.
 */
async function installAudibleScreenCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'freecord:media-settings',
      JSON.stringify({ screenAudio: true, screenAudioGuard: false }),
    );

    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia: () => Promise<MediaStream>;
    };
    mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext('2d');
      context?.fillRect(0, 0, canvas.width, canvas.height);

      const videoStream = canvas.captureStream(5);
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      tone.connect(destination);
      tone.start();

      const stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      // The stream owns neither Web Audio node. Keep both alive for as long
      // as the page exists, just as a real capture device would be.
      (window as unknown as { __screenCapture?: unknown }).__screenCapture = {
        audio,
        canvas,
        tone,
      };
      return stream;
    };
  });
}

/** A deterministic YouTube player that records the local volume calls. */
async function installVolumeYouTube(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Config {
      events: { onReady(): void; onStateChange(event: { data: number }): void };
    }

    class FakeYouTubePlayer {
      volume = 100;
      private time = 0;

      constructor(_element: HTMLElement, raw: unknown) {
        harness.instances.push(this);
        queueMicrotask(() => (raw as Config).events.onReady());
      }

      playVideo(): void {}
      pauseVideo(): void {}
      seekTo(seconds: number): void {
        this.time = seconds;
      }
      getCurrentTime(): number {
        return this.time;
      }
      getDuration(): number {
        return 120;
      }
      getVideoData(): { isLive: false } {
        return { isLive: false };
      }
      getPlayerState(): number {
        return 1;
      }
      loadVideoById(): void {}
      cueVideoById(): void {}
      loadPlaylist(): void {}
      cuePlaylist(): void {}
      getPlaylistIndex(): number {
        return -1;
      }
      getPlaylist(): null {
        return null;
      }
      playVideoAt(): void {}
      mute(): void {}
      unMute(): void {}
      setVolume(volume: number): void {
        this.volume = volume;
      }
      destroy(): void {}
    }

    const harness = { instances: [] as FakeYouTubePlayer[] };
    const target = window as unknown as {
      YT: { Player: typeof FakeYouTubePlayer };
      __youtubeVolume: typeof harness;
    };
    target.__youtubeVolume = harness;
    target.YT = { Player: FakeYouTubePlayer };
  });
}

/**
 * Per-source volume, checked where it actually has to land: on the media
 * element or player that renders that source.
 *
 * A slider that moves and a number that changes prove nothing — the level
 * lives in a store, and the whole feature is whether it reaches the
 * right source and leaves everyone else alone. So every assertion here
 * reads the media element's volume or the embedded player's volume call.
 */
test.describe('per-source volume', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('turns one person down without touching the others, and remembers where they were', async ({
    browser,
  }) => {
    const { slug } = await createRoom('mixer');
    handles = await joinMany(browser, slug, 3, 'mixer');
    const [me, ...others] = handles;

    // Two remote peers, so "only that one moved" is a claim with something
    // to compare against.
    const sinks = me.page.locator('.tile audio');
    await expect(sinks).toHaveCount(2, { timeout: 20_000 });
    const volumes = async () =>
      sinks.evaluateAll((elements) =>
        (elements as HTMLAudioElement[]).map((element) => Math.round(element.volume * 100)),
      );
    expect(await volumes()).toEqual([100, 100]);

    await me.page.getByRole('button', { name: /volume per source/i }).click();
    const mixer = me.page.getByRole('dialog', { name: /^volume$/i });
    await expect(mixer).toBeVisible();

    const target = others[0].name;
    const slider = mixer.getByRole('slider', { name: new RegExp(`volume for ${target}`, 'i') });
    await slider.fill('30');
    await expect.poll(volumes).toEqual([30, 100]);

    // Mute is silence that does not forget the slider…
    await mixer.getByRole('switch', { name: new RegExp(`mute ${target}`, 'i') }).click();
    await expect.poll(volumes).toEqual([0, 100]);
    // …so coming back lands where it was, not at full.
    await mixer.getByRole('switch', { name: new RegExp(`unmute ${target}`, 'i') }).click();
    await expect.poll(volumes).toEqual([30, 100]);
  });

  test('is one viewer’s own opinion and reaches nobody else', async ({ browser }) => {
    const { slug } = await createRoom('mixer-private');
    handles = await joinMany(browser, slug, 2, 'private');
    const [me, them] = handles;

    await expect(me.page.locator('.tile audio')).toHaveCount(1, { timeout: 20_000 });
    await me.page.getByRole('button', { name: /volume per source/i }).click();
    const mixer = me.page.getByRole('dialog', { name: /^volume$/i });
    await mixer.getByRole('slider', { name: new RegExp(`volume for ${them.name}`, 'i') }).fill('10');
    await expect
      .poll(() => me.page.locator('.tile audio').first().evaluate((a: HTMLAudioElement) => a.volume))
      .toBeCloseTo(0.1, 2);

    // Nothing about a level goes on the wire: the other side is still
    // playing us at full, and never heard about it.
    await expect
      .poll(() =>
        them.page.locator('.tile audio').first().evaluate((a: HTMLAudioElement) => a.volume),
      )
      .toBe(1);
  });

  test('changes Watch Together only for this viewer and remembers it after reload', async ({
    browser,
  }) => {
    const { slug } = await createRoom('mixer-watch-private');
    handles = [
      await joinRoomPage(browser, slug, 'watch-owner', { prepare: installVolumeYouTube }),
      await joinRoomPage(browser, slug, 'watch-viewer', { prepare: installVolumeYouTube }),
    ];
    const [owner, viewer] = handles;

    await owner.page.locator('button[data-key="C"]').click();
    const box = owner.page.locator('.chat-panel textarea');
    await box.fill('/play https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await box.press('Enter');

    await expect(owner.page.locator('.watch-youtube')).toHaveCount(1);
    await expect(viewer.page.locator('.watch-youtube')).toHaveCount(1);

    await viewer.page.getByRole('button', { name: /volume per source/i }).click();
    const mixer = viewer.page.getByRole('dialog', { name: /^volume$/i });
    const slider = mixer.getByRole('slider', { name: /volume for watch together/i });
    await slider.fill('25');

    const youtubeVolume = (page: Page) =>
      page.evaluate(
        () =>
          (window as unknown as { __youtubeVolume: { instances: Array<{ volume: number }> } })
            .__youtubeVolume.instances[0]?.volume,
      );
    await expect.poll(() => youtubeVolume(viewer.page)).toBe(25);
    await expect.poll(() => youtubeVolume(owner.page)).toBe(100);

    // A tool id is stable across sessions, so this private preference is
    // restored without putting a volume field in the room's shared state.
    await viewer.page.reload();
    const name = viewer.page.getByRole('textbox', { name: /your name/i });
    await expect(name).toBeVisible();
    await name.fill('watch-viewer');
    await viewer.page.getByRole('button', { name: /join the room/i }).click();
    await expect(viewer.page.locator('.watch-youtube')).toHaveCount(1, { timeout: 20_000 });
    await expect.poll(() => youtubeVolume(viewer.page)).toBe(25);
    await expect.poll(() => youtubeVolume(owner.page)).toBe(100);
  });

  test('changes a transmission only for this viewer', async ({ browser }) => {
    const { slug } = await createRoom('mixer-screen-private');
    handles = [
      await joinRoomPage(browser, slug, 'screen-owner', { prepare: installAudibleScreenCapture }),
      await joinRoomPage(browser, slug, 'screen-viewer'),
      await joinRoomPage(browser, slug, 'screen-other'),
    ];
    const [owner, viewer, other] = handles;

    await screenShareButton(owner.page).click();
    const viewerSink = viewer.page.locator('.room-layout > audio');
    const otherSink = other.page.locator('.room-layout > audio');
    await expect(viewerSink).toHaveCount(1, { timeout: 30_000 });
    await expect(otherSink).toHaveCount(1, { timeout: 30_000 });

    await viewer.page.getByRole('button', { name: /volume per source/i }).click();
    const mixer = viewer.page.getByRole('dialog', { name: /^volume$/i });
    await mixer.getByRole('slider', { name: /volume for screen-owner.s screen$/i }).fill('35');

    await expect.poll(() => viewerSink.evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(0.35);
    await expect.poll(() => otherSink.evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(1);
  });

  test('amplifies one person up to 200% through a valid media stream', async ({ browser }) => {
    const { slug } = await createRoom('mixer-boost');
    handles = await joinMany(browser, slug, 2, 'boost');
    const [me, them] = handles;

    const sink = me.page.locator('.tile audio').first();
    await expect(sink).toHaveCount(1, { timeout: 20_000 });
    await expect
      .poll(() =>
        sink.evaluate(
          (element: HTMLAudioElement) =>
            (element.srcObject as MediaStream | null)?.getAudioTracks()[0]?.id,
        ),
      )
      .toBeTruthy();
    const originalTrack = await sink.evaluate(
      (element: HTMLAudioElement) => (element.srcObject as MediaStream).getAudioTracks()[0]?.id,
    );
    expect(originalTrack).toBeTruthy();

    await me.page.getByRole('button', { name: /volume per source/i }).click();
    const mixer = me.page.getByRole('dialog', { name: /^volume$/i });
    const slider = mixer.getByRole('slider', {
      name: new RegExp(`volume for ${them.name}`, 'i'),
    });
    await expect(slider).toHaveAttribute('max', '200');
    await slider.fill('200');

    await expect(mixer.getByText('200%')).toBeVisible();
    await expect.poll(() => sink.evaluate((element: HTMLAudioElement) => element.volume)).toBe(1);
    await expect
      .poll(() =>
        sink.evaluate(
          (element: HTMLAudioElement) =>
            (element.srcObject as MediaStream).getAudioTracks()[0]?.id,
        ),
      )
      .not.toBe(originalTrack);
  });
});
