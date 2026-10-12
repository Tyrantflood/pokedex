import formIds from "./species-ids.generated.json";

/**
 * PokéAPI id of the sprite/cry for a battle species. Base formes use their National Dex number; alternate forms (Megas,
 * regional forms, ...) are looked up in the generated table (scripts/build-battle-species.mjs). A forme PokéAPI has no entry
 * for (cosmetic ones such as Pikachu's caps) shows its base species.
 */
export function spriteIdFor(speciesId: string, dexNum: number): number {
  return (formIds as Record<string, number>)[speciesId] ?? dexNum;
}

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const CRIES = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

export type Facing = "front" | "back";

/** Candidate images for a battler, best first: the animated Showdown GIF, then the pixel sprite. */
export function battleSpriteUrls(spriteId: number, facing: Facing): string[] {
  const back = facing === "back" ? "back/" : "";
  return [`${SPRITES}/other/showdown/${back}${spriteId}.gif`, `${SPRITES}/${back}${spriteId}.png`];
}

export const cryUrl = (spriteId: number) => `${CRIES}/${spriteId}.ogg`;

/** Lowercase letters and digits only, as the simulator derives ids from names. */
export const toId = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");
