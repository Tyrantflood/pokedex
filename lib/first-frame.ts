/** Most still frames kept at once; the oldest is dropped (and its blob freed) beyond this. */
const MAX_FRAMES = 40;

// Insertion-ordered, so the first key is the oldest.
const frames = new Map<string, Promise<string | null>>();

/**
 * The first frame of an animated image as a static image URL, or null if it can't be extracted
 * (for instance when the host doesn't allow cross-origin canvas reads). Used to pause animations
 * for reduced motion, and to build silhouettes without running a filter on every animation frame.
 * Results are cached per source.
 */
export function firstFrame(src: string): Promise<string | null> {
  const cached = frames.get(src);
  if (cached) return cached;

  const request = (async () => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    try {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      return blob ? URL.createObjectURL(blob) : null;
    } catch {
      return null;
    }
  })();

  frames.set(src, request);
  request.then((url) => {
    if (url === null) frames.delete(src); // failures aren't remembered, so a later try can succeed
  });
  while (frames.size > MAX_FRAMES) {
    const [oldest, pending] = frames.entries().next().value!;
    frames.delete(oldest);
    pending.then((url) => url && URL.revokeObjectURL(url));
  }
  return request;
}
