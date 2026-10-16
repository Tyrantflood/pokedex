/**
 * The choice string for a move, with the one-off battle gimmicks (Mega Evolution, Ultra Burst, Z-Moves, Dynamax, Terastallization). These are
 * only ever added when the player turns the matching toggle on: a Pokémon that merely CAN Mega Evolve, use a Z-Move, Dynamax or Terastallize
 * keeps doing ordinary moves until then. Pure.
 */
export type Special = "mega" | "ultra" | "z" | "dynamax" | "tera";

export const SPECIAL_SUFFIX: Record<Special, string> = { mega: " mega", ultra: " ultra", z: " zmove", dynamax: " dynamax", tera: " terastallize" };
export const SPECIAL_LABEL: Record<Special, string> = { mega: "Mega Evolve", ultra: "Ultra Burst", z: "Z-Move", dynamax: "Dynamax", tera: "Terastallize" };

/** `slot` is 1 to 4. With no toggle on (`special` null) it is a plain move. */
export const moveChoice = (slot: number, special: Special | null): string => `move ${slot}${special ? SPECIAL_SUFFIX[special] : ""}`;
