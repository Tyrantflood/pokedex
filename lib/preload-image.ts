const preloaded = new Map<string, HTMLImageElement>();

/**
 * Starts fetching and decoding an image ahead of time. Holding a reference keeps the
 * decoded bitmap alive, so an <img> with the same URL renders without waiting.
 * Safe to call repeatedly; each URL is only requested once.
 */
export function preloadImage(url: string | null): void {
  if (!url || preloaded.has(url) || typeof Image === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  preloaded.set(url, img);
  img.decode().catch(() => preloaded.delete(url));
}
