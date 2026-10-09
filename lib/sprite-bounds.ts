/**
 * Where the creature actually is inside a sprite image. Official artwork is a square canvas with
 * transparent padding that varies from Pokémon to Pokémon, so scaling by image size would make a
 * small Pokémon look as tall as a big one. For a true-to-scale comparison we size the *visible*
 * part, found by scanning the alpha channel.
 */
export interface SpriteBounds {
  naturalWidth: number;
  naturalHeight: number;
  /** Opaque region in image pixels: left/top inclusive, right/bottom exclusive. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** False when the pixels could not be read; bounds then cover the whole image (approximate). */
  measured: boolean;
}

const ALPHA_THRESHOLD = 24; // ignore faint anti-aliasing and soft shadows
const cache = new Map<string, Promise<SpriteBounds>>();

export function measureSpriteBounds(url: string): Promise<SpriteBounds> {
  let pending = cache.get(url);
  if (!pending) {
    pending = scan(url).catch((error) => {
      cache.delete(url); // don't remember failures (e.g. a flaky network)
      throw error;
    });
    cache.set(url, pending);
  }
  return pending;
}

async function scan(url: string): Promise<SpriteBounds> {
  const img = new Image();
  // Cross-origin artwork can only be read from a canvas if it was requested with CORS.
  // raw.githubusercontent.com sends Access-Control-Allow-Origin: *.
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const whole: SpriteBounds = { naturalWidth: width, naturalHeight: height, left: 0, top: 0, right: width, bottom: height, measured: false };

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return whole;
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, width, height);

    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right < left || bottom < top) return whole; // fully transparent?!
    return { naturalWidth: width, naturalHeight: height, left, top, right: right + 1, bottom: bottom + 1, measured: true };
  } catch {
    return whole; // tainted canvas: fall back to the full image
  }
}
