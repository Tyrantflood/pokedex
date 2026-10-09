"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Standard modal behaviour: locks page scroll (without a layout jump), closes on Escape, keeps
 * Tab inside the dialog, and hands focus back afterwards. Same approach as the detail view.
 *
 * @param scope        the dialog element
 * @param onClose      called when Escape is pressed
 * @param fallbackFocus where focus should go if the element that opened the dialog is gone
 *                     (e.g. it was opened by a drag and drop, which has no focused opener)
 */
export function useModal(scope: RefObject<HTMLElement | null>, onClose: () => void, fallbackFocus?: () => HTMLElement | null) {
  const closeRef = useRef(onClose);
  const fallbackRef = useRef(fallbackFocus);
  useEffect(() => {
    closeRef.current = onClose;
    fallbackRef.current = fallbackFocus;
  });

  // Scroll lock. The page reserves a scrollbar gutter (globals.css); swap it for equal padding
  // while locked so nothing shifts. Runs before paint.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter, padding: html.style.paddingRight };
    const reserved = window.innerWidth - html.clientWidth;
    html.style.scrollbarGutter = "auto";
    html.style.overflow = "hidden";
    html.style.paddingRight = `${reserved}px`;
    return () => {
      html.style.overflow = previous.overflow;
      html.style.scrollbarGutter = previous.gutter;
      html.style.paddingRight = previous.padding;
    };
  }, []);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    scope.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      const root = scope.current;
      if (e.key !== "Tab" || !root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const target = opener && opener.isConnected ? opener : fallbackRef.current?.();
      target?.focus?.({ preventScroll: true });
    };
  }, [scope]);
}
