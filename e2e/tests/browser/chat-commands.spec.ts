import { expect, test, type Page } from '@playwright/test';
import { baseUrl } from '../../helpers/env';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, joinRoomPage, type RoomPageHandle } from '../../helpers/pages';

/** A deterministic live IFrame API: no YouTube network in this regression. */
async function installLiveYouTube(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Events {
      onReady(): void;
      onStateChange(event: { data: number }): void;
    }
    interface Config {
      playerVars: { autoplay?: number; start?: number; controls?: number };
      events: Events;
    }

    class FakeLivePlayer {
      readonly seeks: number[] = [];
      readonly config: Config;
      private time = 0;
      private timeAt = Date.now();
      private state = 1;
      private readonly edge = 3_600;
      private readonly edgeAt = Date.now();

      constructor(_element: HTMLElement, raw: unknown) {
        this.config = raw as Config;
        this.state = this.config.playerVars.autoplay ? 1 : 2;
        harness.instances.push(this);
        queueMicrotask(() => this.config.events.onReady());
      }

      private running(value: number, at: number): number {
        return value + (this.state === 1 ? Math.max(0, Date.now() - at) / 1_000 : 0);
      }

      getCurrentTime(): number {
        return this.running(this.time, this.timeAt);
      }

      getDuration(): number {
        return this.edge + Math.max(0, Date.now() - this.edgeAt) / 1_000;
      }

      getVideoData(): { isLive: true } {
        return { isLive: true };
      }

      getPlayerState(): number {
        return this.state;
      }

      seekTo(seconds: number): void {
        this.time = seconds;
        this.timeAt = Date.now();
        this.seeks.push(seconds);
      }

      manualSeek(seconds: number): void {
        this.time = seconds;
        this.timeAt = Date.now();
        this.config.events.onStateChange({ data: this.state });
      }

      playVideo(): void {
        this.time = this.getCurrentTime();
        this.timeAt = Date.now();
        this.state = 1;
      }

      pauseVideo(): void {
        this.time = this.getCurrentTime();
        this.timeAt = Date.now();
        this.state = 2;
      }

      loadVideoById(options: { startSeconds?: number }): void {
        this.seekTo(options.startSeconds ?? 0);
      }

      cueVideoById(options: { startSeconds?: number }): void {
        this.seekTo(options.startSeconds ?? 0);
      }

      loadPlaylist(): void {}
      cuePlaylist(): void {}
      getPlaylistIndex(): number { return -1; }
      getPlaylist(): null { return null; }
      playVideoAt(): void {}
      mute(): void {}
      unMute(): void {}
      setVolume(): void {}
      destroy(): void {}
    }

    const harness = { instances: [] as FakeLivePlayer[] };
    const target = window as unknown as {
      YT: { Player: typeof FakeLivePlayer };
      __youtubeHarness: typeof harness;
    };
    target.__youtubeHarness = harness;
    target.YT = { Player: FakeLivePlayer };
  });
}

/**
 * A browser that will not autoplay — the ordinary case, and the one that
 * used to strand a viewer.
 *
 * The player refuses to start on its own and keeps refusing until
 * somebody's hand asks for it, which is exactly what an autoplay policy
 * does. Nothing here is YouTube-specific: the same refusal reaches a
 * `<video>` element and a Twitch embed.
 */
async function installStubbornYouTube(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Config {
      playerVars: { autoplay?: number };
      events: { onReady(): void; onStateChange(event: { data: number }): void };
    }

    class StubbornPlayer {
      readonly config: Config;
      /** -1 unstarted, 1 playing, 2 paused — YouTube's own numbers. */
      private state = -1;
      private time = 0;

      constructor(_element: HTMLElement, raw: unknown) {
        this.config = raw as Config;
        harness.instances.push(this);
        queueMicrotask(() => this.config.events.onReady());
      }

      playVideo(): void {
        // The refusal: asked a hundred times, it starts only once a
        // person has asked for it in this tab.
        if (!harness.allowed) {
          return;
        }
        this.state = 1;
        this.config.events.onStateChange({ data: 1 });
      }

      pauseVideo(): void {
        this.state = 2;
      }

      getPlayerState(): number {
        return this.state;
      }

      getCurrentTime(): number {
        return this.time;
      }

      seekTo(seconds: number): void {
        this.time = seconds;
      }

      getDuration(): number {
        return 600;
      }

      getVideoData(): { isLive: false } {
        return { isLive: false };
      }

      loadVideoById(options: { startSeconds?: number }): void {
        this.seekTo(options.startSeconds ?? 0);
      }
      cueVideoById(options: { startSeconds?: number }): void {
        this.seekTo(options.startSeconds ?? 0);
      }
      loadPlaylist(): void {}
      cuePlaylist(): void {}
      getPlaylistIndex(): number { return -1; }
      getPlaylist(): null { return null; }
      playVideoAt(): void {}
      mute(): void {}
      unMute(): void {}
      setVolume(): void {}
      destroy(): void {}
    }

    const harness = { instances: [] as StubbornPlayer[], allowed: false };
    const target = window as unknown as {
      YT: { Player: typeof StubbornPlayer };
      __stubborn: typeof harness;
    };
    target.__stubborn = harness;
    target.YT = { Player: StubbornPlayer };
  });
}

/**
 * Slash commands: the chat as a second door onto the dock and the chat's
 * own header.
 *
 * The risk here is wiring, and it points two ways. A command that does not
 * run is a key that went missing; a line that runs when it should not is
 * worse — somebody's message swallowed, or a room muted by a message about
 * muting. So both directions are checked, and the last case is the one
 * that matters most: a path (`/etc/hosts`) is a message, not a command.
 *
 * Nothing here matches on ambient copy. The command WORDS are not
 * translated and are safe to type; what is asserted is structure — how
 * many rows the list has, what the dock's keys say about themselves, what
 * ended up in a bubble.
 */
test.describe('chat commands', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('lists, completes and runs; leaves ordinary lines alone', async ({ browser }) => {
    const { slug } = await createRoom('chat-commands');
    handles = await joinMany(browser, slug, 1);
    const page = handles[0]!.page;

    await page.locator('button[data-key="C"]').click();
    const box = page.locator('.chat-panel textarea');
    const menu = page.getByRole('listbox');

    // A bare slash offers everything the build has, and says so to a
    // screen reader through the field rather than by taking the focus.
    await box.fill('/');
    await expect(menu).toBeVisible();
    const all = await menu.getByRole('option').count();
    expect(all).toBeGreaterThan(8);
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await expect(box).toBeFocused();

    // Typing narrows it; the highlight is the first row and moves with the
    // arrow keys, which the field reports as the active descendant.
    await box.fill('/s');
    const narrowed = await menu.getByRole('option').count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(all);
    const first = await box.getAttribute('aria-activedescendant');
    await box.press('ArrowDown');
    expect(await box.getAttribute('aria-activedescendant')).not.toBe(first);

    // Escape puts the list away and keeps both the text and the panel.
    await box.press('Escape');
    await expect(menu).toBeHidden();
    await expect(box).toHaveValue('/s');
    await expect(page.locator('.chat-panel')).toBeVisible();

    // Tab completes to the word and waits where the argument goes.
    await box.fill('/sea');
    await box.press('Tab');
    await expect(box).toHaveValue('/search ');

    // A command that takes nothing runs on the key that picks it: the
    // speaker key in the dock is the room's own answer for whether it did.
    const speaker = page.locator('button[aria-keyshortcuts="d"]');
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');
    await box.fill('/sou');
    await box.press('Enter');
    await expect(speaker).toHaveAttribute('aria-pressed', 'true');
    await expect(box).toHaveValue('');
    await box.fill('/sound');
    await box.press('Enter');
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');

    // /me is a message in the end, and lands in a bubble as emphasis.
    await box.fill('/me waves at the room');
    await box.press('Enter');
    await expect(page.locator('.chat-bubble em')).toHaveText('waves at the room');
    await expect(page.locator('.chat-bubble')).toHaveCount(1);

    // /search opens the chat's own search on what came after it.
    await box.fill('/search waves');
    await box.press('Enter');
    await expect(page.getByRole('searchbox', { name: /search the messages/i })).toHaveValue('waves');
    await expect(page.locator('.chat-bubble')).toHaveCount(1);
    await page.getByRole('searchbox', { name: /search the messages/i }).press('Escape');

    // A slash and a word nobody has: said so, nothing sent, text kept.
    await box.fill('/paly something');
    await box.press('Enter');
    await expect(page.locator('.chat-panel [role="status"]').last()).toBeVisible();
    await expect(box).toHaveValue('/paly something');
    await expect(page.locator('.chat-bubble')).toHaveCount(1);

    // And the line that must never be read as a command: a path goes out
    // as what it is, as does a message that opens with a double slash.
    await box.fill('/etc/hosts is a file');
    await box.press('Enter');
    await box.fill('//sound is how you mute the room');
    await box.press('Enter');
    await expect(page.locator('.chat-bubble')).toHaveCount(3);
    await expect(page.locator('.chat-bubble').nth(1)).toContainText('/etc/hosts is a file');
    await expect(page.locator('.chat-bubble').nth(2)).toContainText('/sound is how you mute');
    // The speakers were never touched by a line that talks about them.
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * The three that reach a tool. Nothing here leaves the machine: the two
   * addresses are on this run's own server and the page URL is never
   * fetched at all, which is the point of it.
   *
   * Both media addresses 404, so the tool swaps its player for its own
   * "this did not play here" line — which is the right thing for it to do
   * and none of this test's business. What is asserted is the state the
   * ROOM agreed on: the stage is up, the queue has one, the queue is
   * empty again, the stage is gone.
   */
  test('plays, queues and skips through the shelf, and hands a page back to it', async ({
    browser,
  }) => {
    const { slug } = await createRoom('chat-commands-watch');
    handles = await joinMany(browser, slug, 1);
    const page = handles[0]!.page;

    await page.locator('button[data-key="C"]').click();
    const box = page.locator('.chat-panel textarea');
    const tools = page.locator('button[data-key="T"]');

    // Nothing is on, so there is nothing to skip or to take off.
    await box.fill('/skip');
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(0);
    await box.fill('/stop');
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(0);

    // A media address is read here, in the browser, and goes on at once.
    await box.fill(`/play ${baseUrl()}/one.mp4`);
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(1);
    await expect(tools).toHaveClass(/control-active/);
    await expect(box).toHaveValue('');

    // The next one lines up behind it, and the strip says how many.
    await box.fill(`/queue ${baseUrl()}/two.mp4`);
    await box.press('Enter');
    await expect(page.locator('.watch-queued')).toBeVisible();

    // Skipping empties the queue and leaves the room watching.
    await box.fill('/skip');
    await box.press('Enter');
    await expect(page.locator('.watch-queued')).toHaveCount(0);
    await expect(page.locator('.watch-frame')).toHaveCount(1);

    // And off, for everybody.
    await box.fill('/stop');
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(0);
    await expect(tools).not.toHaveClass(/control-active/);

    // A PAGE is nobody's to play from a chat line: the shelf opens with
    // the link already in its field, and the person reads it from there.
    await box.fill('/play https://example.com/an/episode');
    await box.press('Enter');
    await expect(page.locator('.tools-menu')).toBeVisible();
    await expect(page.locator('.tools-menu .tool-field')).toHaveValue(
      'https://example.com/an/episode',
    );
    await expect(page.locator('.watch-frame')).toHaveCount(0);
  });

  test('only the participant who starts Watch together can control it', async ({ browser }) => {
    const { slug } = await createRoom('watch-controller');
    handles = await joinMany(browser, slug, 2, 'viewer');
    const owner = handles[0]!.page;
    const viewer = handles[1]!.page;

    await owner.locator('button[data-key="C"]').click();
    const ownerBox = owner.locator('.chat-panel textarea');
    await ownerBox.fill(`/play ${baseUrl()}/controlled.mp4`);
    await ownerBox.press('Enter');

    await expect(owner.locator('.watch-frame')).toHaveCount(1);
    await expect(viewer.locator('.watch-frame')).toHaveCount(1);
    await expect(owner.getByRole('button', { name: 'Close it for everyone' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Close it for everyone' })).toHaveCount(0);
    await expect(viewer.locator('.watch-controller-chip')).toContainText('viewer-0');

    // Read-only means nothing to press, not a bar that answers nobody: the
    // player's own controls belong to whoever the room is following.
    await expect(owner.locator('.watch-media')).toHaveJSProperty('controls', true);
    await expect(viewer.locator('.watch-media')).toHaveJSProperty('controls', false);

    await viewer.locator('button[data-key="T"]').click();
    await expect(viewer.locator('.watch-controller-note')).toContainText('viewer-0');
    await expect(viewer.locator('.tools-menu .tool-field')).toHaveCount(0);
    await viewer.keyboard.press('Escape');

    // The UI is read-only, and the server is the final boundary: even a
    // slash command that bypasses the stage controls cannot close it.
    await viewer.locator('button[data-key="C"]').click();
    const viewerBox = viewer.locator('.chat-panel textarea');
    await viewerBox.fill('/stop');
    await viewerBox.press('Enter');
    await expect(viewer.locator('.watch-frame')).toHaveCount(1);
    await expect(owner.locator('.watch-frame')).toHaveCount(1);

    await ownerBox.fill('/stop');
    await ownerBox.press('Enter');
    await expect(owner.locator('.watch-frame')).toHaveCount(0);
    await expect(viewer.locator('.watch-frame')).toHaveCount(0);
  });

  test('a viewer whose browser refuses to autoplay is offered a way in', async ({ browser }) => {
    const { slug } = await createRoom('watch-stalled-viewer');
    handles = [
      await joinRoomPage(browser, slug, 'owner', { prepare: installStubbornYouTube }),
      await joinRoomPage(browser, slug, 'viewer', { prepare: installStubbornYouTube }),
    ];
    const owner = handles[0]!.page;
    const viewer = handles[1]!.page;

    await owner.locator('button[data-key="C"]').click();
    const ownerBox = owner.locator('.chat-panel textarea');
    await ownerBox.fill('/play https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await ownerBox.press('Enter');

    await expect(owner.locator('.watch-frame')).toHaveCount(1);
    await expect(viewer.locator('.watch-frame')).toHaveCount(1);

    // The room is playing and this copy is not. The viewer has none of the
    // player's own chrome to press, so the room offers its own key.
    const key = viewer.locator('.watch-catchup');
    await expect(key).toBeVisible({ timeout: 20_000 });

    // Not to the controller: their player's own controls are right there,
    // and a second play button over them would be the room second-guessing
    // the person driving.
    await expect(owner.locator('.watch-catchup')).toHaveCount(0);

    // A hand on it is the gesture the browser was holding out for.
    await viewer.evaluate(() => {
      (window as unknown as { __stubborn: { allowed: boolean } }).__stubborn.allowed = true;
    });
    await key.click();

    await expect
      .poll(() =>
        viewer.evaluate(
          () =>
            (window as unknown as {
              __stubborn: { instances: Array<{ getPlayerState(): number }> };
            }).__stubborn.instances[0]?.getPlayerState(),
        ),
      )
      .toBe(1);
    await expect(key).toHaveCount(0);

    // And it stayed this viewer's business: the room was never told.
    await expect(owner.locator('.watch-frame')).toHaveCount(1);
    await expect(viewer.locator('.watch-controller-chip')).toContainText('owner');
  });

  test('YouTube Live starts at the edge, settles seek bursts once, and can resync locally', async ({
    browser,
  }) => {
    const { slug } = await createRoom('youtube-live-sync');
    handles = [
      await joinRoomPage(browser, slug, 'owner', { prepare: installLiveYouTube }),
      await joinRoomPage(browser, slug, 'viewer', { prepare: installLiveYouTube }),
    ];
    const owner = handles[0]!.page;
    const viewer = handles[1]!.page;

    await owner.locator('button[data-key="C"]').click();
    const ownerBox = owner.locator('.chat-panel textarea');
    // A normal watch URL is what YouTube's share button commonly gives for
    // a live. The runtime player data, not only `/live/`, must recognise it.
    await ownerBox.fill('/play https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await ownerBox.press('Enter');

    for (const page of [owner, viewer]) {
      await expect(page.getByRole('button', { name: 'Resync with the room' })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const fake = (window as unknown as {
              __youtubeHarness: { instances: Array<{ seeks: number[] }> };
            }).__youtubeHarness.instances[0];
            return fake?.seeks.at(-1) ?? 0;
          }),
        )
        .toBeGreaterThan(3_590);
    }
    expect(
      await owner.evaluate(() => {
        const fake = (window as unknown as {
          __youtubeHarness: { instances: Array<{ config: { playerVars: { start?: number } } }> };
        }).__youtubeHarness.instances[0];
        return fake?.config.playerVars.start;
      }),
    ).toBeUndefined();

    // YouTube settles its chrome when the player is built, so this is the
    // one thing the stage cannot correct afterwards: the viewer's player
    // is asked for a picture and nothing to press.
    const chromeOf = (page: Page) =>
      page.evaluate(() => {
        const fake = (window as unknown as {
          __youtubeHarness: {
            instances: Array<{ config: { playerVars: { controls?: number; disablekb?: number } } }>;
          };
        }).__youtubeHarness.instances[0];
        return fake?.config.playerVars;
      });
    expect(await chromeOf(owner)).toMatchObject({ controls: 1, disablekb: 0 });
    expect(await chromeOf(viewer)).toMatchObject({ controls: 0, disablekb: 1 });

    const viewerBaseline = await viewer.evaluate(() =>
      (window as unknown as { __youtubeHarness: { instances: Array<{ seeks: number[] }> } })
        .__youtubeHarness.instances[0]!.seeks.length,
    );

    // Startup quiet plus one stable sampler tick must clear before these
    // become a person's moves rather than possible loading readings.
    await owner.waitForTimeout(2_500);
    await owner.evaluate(() => {
      const fake = (window as unknown as {
        __youtubeHarness: { instances: Array<{ manualSeek(seconds: number): void }> };
      }).__youtubeHarness.instances[0]!;
      fake.manualSeek(1_000);
      fake.manualSeek(2_000);
      fake.manualSeek(3_500);
    });

    await expect
      .poll(() =>
        viewer.evaluate(() =>
          (window as unknown as { __youtubeHarness: { instances: Array<{ seeks: number[] }> } })
            .__youtubeHarness.instances[0]!.seeks.length,
        ),
      )
      .toBe(viewerBaseline + 1);
    // A silence window proves the two intermediate positions did not arrive
    // later as extra loading states.
    await viewer.waitForTimeout(1_300);
    expect(
      await viewer.evaluate(() =>
        (window as unknown as { __youtubeHarness: { instances: Array<{ seeks: number[] }> } })
          .__youtubeHarness.instances[0]!.seeks.length,
      ),
    ).toBe(viewerBaseline + 1);

    await viewer.evaluate(() => {
      const fake = (window as unknown as {
        __youtubeHarness: { instances: Array<{ manualSeek(seconds: number): void }> };
      }).__youtubeHarness.instances[0]!;
      fake.manualSeek(100);
    });
    await viewer.getByRole('button', { name: 'Resync with the room' }).click();
    await expect
      .poll(() =>
        viewer.evaluate(() => {
          const seeks = (window as unknown as {
            __youtubeHarness: { instances: Array<{ seeks: number[] }> };
          }).__youtubeHarness.instances[0]!.seeks;
          return seeks.at(-1) ?? 0;
        }),
      )
      .toBeGreaterThan(3_490);
  });
});
