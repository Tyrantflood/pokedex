import { isClientId } from "@/lib/battle/room-protocol";

const KEY = "battle:client-id";
let remembered: string | null = null;

/**
 * A random id this browser keeps, which is how a refresh (or a second tab) finds its seat in a room again. It is not a secret and not an
 * account: clearing site data just means a new one. If storage is blocked it lives in memory for the page's lifetime.
 */
export function clientId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && isClientId(saved)) return saved;
  } catch {
    if (remembered) return remembered;
  }
  const id = remembered && isClientId(remembered) ? remembered : crypto.randomUUID().replaceAll("-", "");
  remembered = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* kept in memory */
  }
  return id;
}
