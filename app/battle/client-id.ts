import { isClientId } from "@/lib/battle/room-protocol";

const KEY = "battle:client-id";
// crypto.randomUUID only exists on https pages and localhost; getRandomValues works everywhere (a page opened over plain http on a LAN address).
const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

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
  const id = remembered && isClientId(remembered) ? remembered : randomId();
  remembered = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* kept in memory */
  }
  return id;
}
