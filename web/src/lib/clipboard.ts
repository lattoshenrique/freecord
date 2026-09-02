/**
 * Copying text to the clipboard, wherever the page happens to be running.
 *
 * `navigator.clipboard` is the modern way and the only one Safari really
 * likes, but it is absent on an insecure origin (a plain-http LAN address is
 * exactly how people try this app on a phone) and it rejects when the page is
 * not the focused document. So the fallback stays: a throwaway textarea and
 * `execCommand('copy')`, deprecated and still the thing that works when the
 * modern API refuses.
 *
 * Nothing here reads the clipboard — the app never asks for that permission.
 */

/** True when the text made it out; the caller shows the "copied" tick on that. */
export async function copyText(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied, or the document was not focused: fall through and try the old way.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const area = document.createElement('textarea');
  area.value = text;
  // Off-screen, but not `display: none` — a hidden field cannot be selected.
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Hands the browser a file to save, out of memory — no server, no upload.
 * The object URL is released on the next frame: revoking it in the same tick
 * cancels the download in Firefox.
 */
export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
