/** Where the room server for friend battles lives. Pure strings, safe to import anywhere. */

/** The deployed Worker (Cloudflare, workers.dev subdomain of the owner's account). Override per deployment with NEXT_PUBLIC_BATTLE_HOST. */
export const DEFAULT_BATTLE_HOST = "pokedex-battle.princeobi124.workers.dev";

/** The room server's host for this page: the env override, a local one when developing on this machine, else the deployed Worker. */
export function battleHost(envHost: string | undefined, pageHostname: string): string {
  if (envHost) return envHost;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(pageHostname) ? "localhost:8787" : DEFAULT_BATTLE_HOST;
}

export const inviteUrl = (origin: string, code: string) => `${origin}/battle?room=${code}`;

export const SHARE_TITLE = "DEX-LINK battle";

/** The message an invite is shared as. */
export const shareMessage = (url: string) => `Battle me on DEX-LINK: ${url}`;

/** How the Share button works: phones and tablets (a touch screen that has the native share sheet) open it; everything else copies the message. */
export const shareMethod = (env: { canShare: boolean; touch: boolean }): "native" | "copy" => (env.canShare && env.touch ? "native" : "copy");
