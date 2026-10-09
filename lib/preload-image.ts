/** Most images kept preloaded at once; the least recently used one is dropped beyond this. */
export const MAX_PRELOADED_IMAGES = 50;

// A Map iterates in insertion order, so the first key is always the least recently used.
const preloaded = new Map<string, HTMLImageElement>();

/**
 * Starts fetching and decoding an image ahead of time. Holding a reference keeps the
 * decoded bitmap alive, so an <img> with the same URL renders without waiting.
 * Each URL is only requested once while it stays cached; the cache holds at most
 * MAX_PRELOADED_IMAGES entries, evicting the least recently used first.
 */
export function preloadImage(url: string | null): void {
  if (!url || typeof Image === "undefined") return;

  const existing = preloaded.get(url);
  if (existing) {
    // Re-insert to mark as most recently used.
    preloaded.delete(url);
    preloaded.set(url, existing);
    return;
  }

  const img = new Image();
  img.decoding = "async";
  img.src = url;
  preloaded.set(url, img);

  while (preloaded.size > MAX_PRELOADED_IMAGES) {
    const [oldestUrl, oldest] = preloaded.entries().next().value!;
    preloaded.delete(oldestUrl);
    oldest.removeAttribute("src"); // cancel an in-flight load and release the bitmap
  }

  img.decode().catch(() => {
    if (preloaded.get(url) === img) preloaded.delete(url);
  });
}
