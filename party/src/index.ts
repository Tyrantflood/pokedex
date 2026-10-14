/**
 * The friend-battle room server: a Cloudflare Worker with one Durable Object per battle (partyserver), on the free plan.
 * All the rules live in lib/battle/room-logic.ts (tested without any network); this file only connects them to Cloudflare:
 * WebSocket connections in, saved state in the object's storage, the alarm clock for the 60-second forfeit.
 */
import { routePartykitRequest, Server, type Connection, type WSMessage } from "partyserver";
import { RoomLogic, type RoomIO, type RoomStorage } from "../../lib/battle/room-logic";
import { isRoomCode } from "../../lib/battle/room-protocol";
import type { SideId } from "../../lib/battle/protocol";

interface Seat {
  clientId: string;
  side: SideId;
}

export class BattleRoom extends Server<Env> {
  // Hibernation: the object may be evicted from memory while sockets stay open. On the next message it is rebuilt, and `onStart` replays
  // the saved commands, so nothing is lost.
  static options = { hibernate: true };

  private logic!: RoomLogic;

  async onStart() {
    const io: RoomIO = {
      send: (id, message) => this.getConnection(id)?.send(JSON.stringify(message)),
      close: (id) => this.getConnection(id)?.close(1000, "closed"),
      setAlarm: async (at) => {
        if (at === null) await this.ctx.storage.deleteAlarm();
        else await this.ctx.storage.setAlarm(at);
      },
      now: () => Date.now(),
      remember: (id, seat) => this.getConnection<Seat>(id)?.setState(seat),
    };
    const storage: RoomStorage = {
      get: (key) => this.ctx.storage.get(key),
      put: (key, value) => this.ctx.storage.put(key, value),
      list: async <T>(prefix: string) => [...(await this.ctx.storage.list<T>({ prefix })).values()],
      deleteAll: () => this.ctx.storage.deleteAll(),
    };
    const forfeitAfterMs = Number(this.env.FORFEIT_AFTER_MS) || undefined;
    this.logic = new RoomLogic(this.name, io, storage, { forfeitAfterMs });
    // Sockets that stayed open while the object was evicted still know where they sit.
    for (const connection of this.getConnections<Seat | null>()) this.logic.restoreConnection(connection.id, connection.state ?? null);
    await this.logic.load();
  }

  async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    await this.logic.message(connection.id, message);
  }

  async onClose(connection: Connection) {
    await this.logic.closed(connection.id);
  }

  async onAlarm() {
    await this.logic.alarm();
  }

  onError(connection: Connection, error: unknown) {
    console.error("socket error", connection.id, error);
  }
}

/** Which web pages may open a socket. "*" (the default) allows anyone; otherwise a comma-separated list of origins. The room code is the real protection. */
function originAllowed(request: Request, env: Env): boolean {
  const allowed = (env.ALLOWED_ORIGINS ?? "*").split(",").map((o) => o.trim()).filter(Boolean);
  if (allowed.includes("*")) return true;
  const origin = request.headers.get("Origin");
  return !!origin && allowed.includes(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok", { headers: { "content-type": "text/plain" } });
    const routed = await routePartykitRequest(request, env, {
      onBeforeConnect: (req, lobby) => {
        if (!isRoomCode(lobby.name)) return new Response("Bad room code", { status: 400 });
        if (!originAllowed(req, env)) return new Response("Origin not allowed", { status: 403 });
      },
    });
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
