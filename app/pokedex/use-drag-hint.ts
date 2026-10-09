"use client";

import { useEffect, type RefObject } from "react";

const HINT_DELAY_MS = 1000;
const HINT_TEXT = "Drag onto another card to compare";
const DONE_KEY = "pokedex:drag-compared";

// Kept in memory as well, so a browser that blocks storage still stops the hint for the page's life.
let dragComparedThisPage = false;

function hasDragCompared(): boolean {
  if (dragComparedThisPage) return true;
  try {
    return sessionStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Call when a drag-compare completes: the hint is no longer shown for the rest of the session. */
export function markDragCompared(): void {
  dragComparedThisPage = true;
  try {
    sessionStorage.setItem(DONE_KEY, "1");
  } catch {
    /* storage unavailable: the in-memory flag still covers this page */
  }
  document.querySelector(".drag-hint")?.remove();
}

/**
 * Teaches the drag gesture: rest a mouse or pen on a card for a second and a small scanner-style
 * label appears. Never shown for touch (those users have the Compare button), while a drag or
 * comparison is under way, while a detail view is open, or after a drag-compare has been completed.
 * Built from delegated events and one DOM node, so nothing runs per card.
 */
export function useDragHint(listRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const list = listRef.current;
    if (!list || hasDragCompared()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let hint: HTMLElement | null = null;
    let card: HTMLElement | null = null;

    const hide = () => {
      clearTimeout(timer);
      card = null;
      if (!hint) return;
      const gone = hint;
      hint = null;
      gone.classList.remove("is-shown");
      setTimeout(() => gone.remove(), 200);
    };

    const show = (el: HTMLElement) => {
      if (
        hasDragCompared() ||
        document.body.classList.contains("is-card-dragging") ||
        list.dataset.comparing === "true" ||
        document.querySelector("[role=dialog]") ||
        !el.isConnected
      )
        return;
      const r = el.getBoundingClientRect();
      hint = document.createElement("div");
      hint.className = "drag-hint";
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = HINT_TEXT;
      document.body.append(hint);
      const w = hint.offsetWidth;
      const h = hint.offsetHeight;
      const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      // Over the card's lower edge; above the card instead when there is no room below it.
      const below = r.bottom + 6 + h < window.innerHeight;
      hint.style.transform = `translate3d(${x}px, ${below ? r.bottom - h / 2 : r.top - h / 2}px, 0)`;
      requestAnimationFrame(() => hint?.classList.add("is-shown"));
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.buttons !== 0) return;
      const next = (e.target as HTMLElement).closest<HTMLElement>("[data-card-id]");
      if (next === card) return;
      hide();
      if (!next) return;
      card = next;
      timer = setTimeout(() => card && show(card), HINT_DELAY_MS);
    };
    const onLeave = () => hide();

    list.addEventListener("pointerover", onOver);
    list.addEventListener("pointerleave", onLeave);
    list.addEventListener("pointerdown", onLeave);
    window.addEventListener("scroll", onLeave, { passive: true });
    window.addEventListener("keydown", onLeave);
    return () => {
      list.removeEventListener("pointerover", onOver);
      list.removeEventListener("pointerleave", onLeave);
      list.removeEventListener("pointerdown", onLeave);
      window.removeEventListener("scroll", onLeave);
      window.removeEventListener("keydown", onLeave);
      clearTimeout(timer);
      hint?.remove();
    };
  }, [listRef]);
}
