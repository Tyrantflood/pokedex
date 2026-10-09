"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { PokemonSummary } from "@/lib/summary";

const DRAG_THRESHOLD_PX = 8;
const titleCase = (name: string) => name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const EDGE_ZONE_PX = 90;
const MAX_SCROLL_PX_PER_FRAME = 28;

interface Options {
  /** The element that contains the cards; events are delegated from it. */
  listRef: RefObject<HTMLElement | null>;
  lookup: (id: number) => PokemonSummary | undefined;
  onDrop: (source: PokemonSummary, target: PokemonSummary) => void;
  /** Height of the sticky header, so edge auto-scroll treats it as part of the top edge. */
  topInset: () => number;
}

/**
 * Mouse/pen drag from one card onto another (touch uses the Compare button instead, because
 * dragging on a touch screen is how you scroll). Built on pointer events rather than HTML5
 * drag-and-drop so it works with the cards' own pointer handling, and so the grid can
 * auto-scroll when you drag near its top or bottom edge, which you need in a 1,351-card list.
 *
 * Cards are found by delegation through `data-card-id`, so nothing is attached per card.
 */
export function useCardDrag({ listRef, lookup, onDrop, topInset }: Options) {
  const latest = useRef({ lookup, onDrop, topInset });
  useEffect(() => {
    latest.current = { lookup, onDrop, topInset };
  });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let suppressClick = false;

    const onPointerDown = (down: PointerEvent) => {
      if (down.pointerType === "touch" || down.button !== 0) return;
      const target = down.target as HTMLElement;
      if (target.closest(".compare-btn")) return;
      const sourceEl = target.closest<HTMLElement>("[data-card-id]");
      const source = sourceEl && latest.current.lookup(Number(sourceEl.dataset.cardId));
      if (!sourceEl || !source) return;

      let dragging = false;
      let x = down.clientX;
      let y = down.clientY;
      let ghost: HTMLElement | null = null;
      let ghostLabel: HTMLElement | null = null;
      let hovered: HTMLElement | null = null;
      let raf = 0;

      const setHovered = (next: HTMLElement | null) => {
        if (next === hovered) return;
        hovered?.removeAttribute("data-drop");
        hovered = next;
        next?.setAttribute("data-drop", "true");
        const t = next && latest.current.lookup(Number(next.dataset.cardId));
        if (ghostLabel) ghostLabel.textContent = t ? `Compare with ${titleCase(t.name)}` : "Drop on another card to compare";
      };

      const findTarget = () => {
        for (const el of document.elementsFromPoint(x, y)) {
          const card = el.closest<HTMLElement>("[data-card-id]");
          if (card && card !== sourceEl) return card;
        }
        return null;
      };

      const refresh = () => {
        if (ghost) ghost.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
        setHovered(findTarget());
      };

      const begin = () => {
        dragging = true;
        document.body.classList.add("is-card-dragging");
        sourceEl.setAttribute("data-drag-source", "true");
        ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.setAttribute("aria-hidden", "true");
        const img = document.createElement("img");
        img.src = source.sprite;
        img.alt = "";
        if (source.pixel) img.style.imageRendering = "pixelated";
        ghostLabel = document.createElement("span");
        ghost.append(img, ghostLabel);
        document.body.append(ghost);
        // Keep scrolling while the pointer rests near the top or bottom edge of the window.
        const loop = () => {
          const top = latest.current.topInset() + EDGE_ZONE_PX / 2;
          const bottom = window.innerHeight - EDGE_ZONE_PX;
          let dy = 0;
          if (y > bottom) dy = Math.min(MAX_SCROLL_PX_PER_FRAME, 3 + ((y - bottom) / EDGE_ZONE_PX) * MAX_SCROLL_PX_PER_FRAME);
          else if (y < top) dy = -Math.min(MAX_SCROLL_PX_PER_FRAME, 3 + ((top - y) / EDGE_ZONE_PX) * MAX_SCROLL_PX_PER_FRAME);
          if (dy !== 0) {
            window.scrollBy(0, dy);
            setHovered(findTarget());
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      };

      const cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("blur", onCancel);
        hovered?.removeAttribute("data-drop");
        sourceEl.removeAttribute("data-drag-source");
        ghost?.remove();
        document.body.classList.remove("is-card-dragging");
      };

      function onMove(e: PointerEvent) {
        x = e.clientX;
        y = e.clientY;
        if (!dragging) {
          if (Math.hypot(x - down.clientX, y - down.clientY) < DRAG_THRESHOLD_PX) return;
          begin();
        }
        refresh();
      }
      function onUp() {
        const dropOn = dragging && hovered ? latest.current.lookup(Number(hovered.dataset.cardId)) : undefined;
        const wasDragging = dragging;
        cleanup();
        if (wasDragging) {
          // The browser still sends a click after pointerup; it must not also open the card.
          suppressClick = true;
          setTimeout(() => (suppressClick = false), 60);
        }
        if (dropOn) latest.current.onDrop(source!, dropOn);
      }
      function onCancel() {
        cleanup();
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape" && dragging) {
          e.stopPropagation();
          cleanup();
          suppressClick = true;
          setTimeout(() => (suppressClick = false), 60);
        }
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", onCancel);
    };

    const swallowClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };

    list.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("click", swallowClick, true);
    return () => {
      list.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("click", swallowClick, true);
    };
  }, [listRef]);
}
