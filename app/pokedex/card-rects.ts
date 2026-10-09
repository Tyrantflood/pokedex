/** On-screen rectangles of a grid card and of its sprite, in viewport coordinates. */
export interface CardRects {
  card: DOMRect;
  sprite: DOMRect;
}

export function measureCardElement(el: HTMLElement): CardRects | null {
  const sprite = el.querySelector<HTMLElement>(".sprite-bob");
  if (!sprite) return null;
  return { card: el.getBoundingClientRect(), sprite: sprite.getBoundingClientRect() };
}

/**
 * Finds a card by id in the live grid and measures it now. Returns null when the card
 * isn't mounted (virtualized away or filtered out) or isn't on screen, so callers can
 * fall back to a plain fade instead of flying to a position the user can't see.
 */
export function measureCard(id: number): CardRects | null {
  const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
  if (!el) return null;
  const rects = measureCardElement(el);
  if (!rects) return null;
  const { card } = rects;
  const offscreen = card.bottom < 0 || card.top > window.innerHeight || card.right < 0 || card.left > window.innerWidth;
  return offscreen ? null : rects;
}
