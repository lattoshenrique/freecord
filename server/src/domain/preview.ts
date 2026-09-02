/**
 * What a room link looks like when someone pastes it somewhere.
 *
 * The tags in web/index.html describe the front page, and the runtime rewrite
 * in web/src/seo/RouteMeta.tsx never reaches a preview bot — WhatsApp,
 * Telegram, Discord and Slack read the HTML and never run our JavaScript. So
 * an invite would be previewed as a pitch for the product, shown to someone
 * who was not being pitched: they were invited. Both edges pass index.html
 * through this before answering a /r/:slug URL.
 *
 * Only the image changes. The slug is the credential, so nothing here may
 * depend on which room it is — one card for every invite, drawn ahead of time
 * into web/public/og-room.png and never rendered per room. The title and the
 * description stay as they are: they are true of an invite too, and they carry
 * no slug.
 */

/** The invite card, served by the assets layer like og.png. */
export const ROOM_OG_IMAGE = '/og-room.png';

const ROOM_OG_ALT =
  'An invitation to a Freecord room — voice, video, chat and screen sharing, with no account';

/** og:image and twitter:image, whatever order and spacing the markup uses. */
const IMAGE_TAG = /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")[^"]*(")/g;
const IMAGE_ALT_TAG = /(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/g;

/**
 * Rewrites the preview image of the served index.html to the invite card.
 *
 * `origin` is the origin the request arrived on rather than the canonical
 * site URL: previews have to work from a custom domain, a preview deployment
 * and localhost, and a bot fetches exactly the URL it is given.
 */
export function roomPreviewHtml(html: string, origin: string): string {
  return html
    .replace(IMAGE_TAG, `$1${origin}${ROOM_OG_IMAGE}$2`)
    .replace(IMAGE_ALT_TAG, `$1${ROOM_OG_ALT}$2`);
}
