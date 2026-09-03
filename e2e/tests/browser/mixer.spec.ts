import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/**
 * Per-source volume, checked where it actually has to land: on the media
 * element that plays that person.
 *
 * A slider that moves and a number that changes prove nothing — the level
 * lives in a store, and the whole feature is whether it reaches the
 * `<audio>` element for the right peer and leaves everyone else alone. So
 * every assertion here reads the element's own `volume`.
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
