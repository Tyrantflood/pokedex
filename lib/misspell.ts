// Same-length misspellings for the Ghost theme's flavour text. Pure functions, no React.

const rand = (n: number) => Math.floor(Math.random() * n);
const VOWELS = "aeiou";

/** A same-length misspelling of one word (swapped letters or a changed vowel), or null. */
function misspellWord(word: string): string | null {
  const m = word.match(/^([A-Za-z]{4,})([.,;:!?]*)$/);
  if (!m) return null;
  const [, letters, punct] = m;
  const chars = letters.split("");

  // Prefer swapping two adjacent inner letters (the classic typo)...
  const swaps: number[] = [];
  for (let i = 1; i < chars.length - 2; i++) if (chars[i].toLowerCase() !== chars[i + 1].toLowerCase()) swaps.push(i);
  if (swaps.length > 0 && Math.random() < 0.65) {
    const i = swaps[rand(swaps.length)];
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    return chars.join("") + punct;
  }
  // ...otherwise change a vowel to a different one.
  const vowelAt = chars.map((c, i) => (VOWELS.includes(c.toLowerCase()) ? i : -1)).filter((i) => i > 0 && i < chars.length - 1); // keep first and last letters, like a real typo
  if (vowelAt.length === 0) return null;
  const i = vowelAt[rand(vowelAt.length)];
  const options = VOWELS.split("").filter((v) => v !== chars[i].toLowerCase());
  const next = options[rand(options.length)];
  chars[i] = chars[i] === chars[i].toUpperCase() ? next.toUpperCase() : next;
  return chars.join("") + punct;
}

/**
 * Misspells one to three words of `text`. Edits never change a word's length, so the layout
 * doesn't shift while it happens. Exported for tests.
 */
export function misspell(text: string): string {
  const parts = text.split(/(\s+)/);
  const candidates = parts.flatMap((p, i) => (misspellWord(p) !== null ? [i] : []));
  const count = Math.min(candidates.length, 1 + rand(3));
  for (let n = 0; n < count; n++) {
    const pick = candidates.splice(rand(candidates.length), 1)[0];
    parts[pick] = misspellWord(parts[pick]) ?? parts[pick];
  }
  return parts.join("");
}
