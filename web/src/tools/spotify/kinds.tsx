/**
 * What each kind of thing is called and what it looks like — the one
 * piece both views need, so neither owns it.
 *
 * There is no title anywhere in this tool: reading one means asking
 * Spotify's data API, and this tool asks it nothing (index.ts). So a
 * queued item is drawn as what it IS — a song, a record, a playlist —
 * with its id underneath, which is honest and, next to the glyph, enough
 * to tell two of them apart.
 */
import type { ToolTranslate } from '../contract';
import { ArtistGlyph, DiscGlyph, ListGlyph, MicGlyph, NoteGlyph } from './icons';
import type { ListenKind } from './state';

const LABELS: Record<ListenKind, string> = {
  track: 'kindTrack',
  album: 'kindAlbum',
  playlist: 'kindPlaylist',
  artist: 'kindArtist',
  episode: 'kindEpisode',
  show: 'kindShow',
};

export function kindLabel(kind: ListenKind, t: ToolTranslate): string {
  return t(LABELS[kind]);
}

export function KindGlyph({ kind }: { kind: ListenKind }) {
  switch (kind) {
    case 'album':
      return <DiscGlyph />;
    case 'playlist':
      return <ListGlyph />;
    case 'artist':
      return <ArtistGlyph />;
    case 'episode':
    case 'show':
      return <MicGlyph />;
    default:
      return <NoteGlyph />;
  }
}
