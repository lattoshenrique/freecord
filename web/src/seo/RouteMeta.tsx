import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_URL, seoForPath } from './site';

/** Creates the tag on first use, then reuses it — no duplicates across routes. */
function upsertMeta(selector: string, attribute: 'name' | 'property', key: string): HTMLMetaElement {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  return tag;
}

function setMetaName(name: string, content: string) {
  upsertMeta(`meta[name="${name}"]`, 'name', name).content = content;
}

function setMetaProperty(property: string, content: string) {
  upsertMeta(`meta[property="${property}"]`, 'property', property).content = content;
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Keeps the document's metadata in step with the route.
 *
 * Rendered once inside the router rather than called from each page, so that
 * adding a route is the only thing a new page has to do — and so this never
 * needs to edit a page component that belongs to someone else.
 *
 * The static tags in index.html are what a crawler sees before JavaScript
 * runs, and they describe the home page. This corrects them once the app
 * mounts, which matters most for /r/:slug: a room link is the credential, so
 * a room page must never be indexable.
 */
export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = seoForPath(pathname);
    const canonical = `${SITE_URL}${seo.path}`;

    document.title = seo.title;
    setMetaName('description', seo.description);
    setMetaName(
      'robots',
      seo.indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    );
    setCanonical(canonical);

    setMetaProperty('og:title', seo.title);
    setMetaProperty('og:description', seo.description);
    setMetaProperty('og:url', canonical);
    setMetaName('twitter:title', seo.title);
    setMetaName('twitter:description', seo.description);
  }, [pathname]);

  return null;
}
