/**
 * The optional single-process web host, using only Node APIs.
 *
 * The production Worker serves these files through its ASSETS binding. This
 * path keeps self-hosting and browser E2E available without carrying a whole
 * static-file plugin in the Node dependency tree.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { roomPreviewHtml } from '../domain/preview.js';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

interface PublicFile {
  body: Buffer;
  type: string;
}

/** Reads only a regular file whose resolved path remains under `root`. */
async function readPublicFile(root: string, pathname: string): Promise<PublicFile | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = resolve(root, decoded.replace(/^\/+/, ''));
  if (candidate === root || !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }
  try {
    // realpath also closes the symlink form of directory traversal.
    const file = await realpath(candidate);
    if (!file.startsWith(`${root}${sep}`) || !(await stat(file)).isFile()) {
      return null;
    }
    return {
      body: await readFile(file),
      type: CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/** Registers static files, room previews and the SPA fallback. */
export async function registerWeb(app: FastifyInstance, directory: string): Promise<void> {
  const root = await realpath(directory);
  const index = await readFile(resolve(root, 'index.html'), 'utf8');

  app.get('/*', async (request, reply) => {
    const pathname = new URL(request.url, 'http://local.invalid').pathname;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found' });
    }

    // Room links stay out of search indexes and preview as invitations.
    if (pathname.startsWith('/r/')) {
      const origin = `${request.protocol}://${request.host}`;
      return reply
        .header('X-Robots-Tag', 'noindex, nofollow')
        .type('text/html; charset=utf-8')
        .send(roomPreviewHtml(index, origin));
    }

    const file = await readPublicFile(root, pathname);
    if (file) {
      return reply.header('X-Content-Type-Options', 'nosniff').type(file.type).send(file.body);
    }
    return reply.type('text/html; charset=utf-8').send(index);
  });
}
