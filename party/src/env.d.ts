declare namespace Cloudflare {
  interface Env {
    BattleRoom: DurableObjectNamespace;
    /** Comma-separated origins allowed to open a socket; "*" or unset: any. */
    ALLOWED_ORIGINS?: string;
    /** Milliseconds a missing player may be gone before forfeiting (default 60000); for tests. */
    FORFEIT_AFTER_MS?: string;
  }
}
interface Env extends Cloudflare.Env {}
