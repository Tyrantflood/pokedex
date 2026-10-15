/**
 * A friend battle seen from the browser: a WebSocket to the room server (server/ party/src/index.ts), dressed up as the same battle
 * source the screen already uses for the CPU. The server runs the simulator and sends this player only their own side; the
 * simulator is loaded here only for names, types and descriptions (the Dex), never to decide anything.
 *
 * Loaded with `import()` from /battle only, like engine.ts. If the connection drops it reconnects by itself and says hello again with
 * the same browser id, and the server sends back everything this player had seen.
 */
import { Dex } from "@pkmn/sim";
import type { BattleMessage, LocalBattle } from "./engine";
import { makeLookups } from "./dex-facts";
import { formatByKey } from "./formats";
import { parseRequest, type SideId } from "./protocol";
import type { ClientMessage, PlayerStatus, RoomConfig, RoomPhase, ServerMessage } from "./room-protocol";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface OnlineOptions {
  /** The room server's host, e.g. "pokedex-battle.example.workers.dev" or "localhost:8787". */
  host: string;
  code: string;
  /** A random id the browser keeps, which is how a refresh finds its seat. */
  clientId: string;
  name: string;
  /** Set by whoever creates the room; the friend following the link sends nothing. */
  create?: RoomConfig;
}

export interface Welcome {
  side: SideId;
  config: RoomConfig;
  /** The name the server gave this player (a duplicate of the friend's name gets a "(2)"). */
  name: string;
}

export interface OnlineEvents {
  /** Once, when the server has seated us: the battle source for the screen. */
  onReady(source: LocalBattle, welcome: Welcome): void;
  onMessage(message: BattleMessage): void;
  onStatus(status: { phase: RoomPhase; players: PlayerStatus[] }): void;
  /** The server's verdict on the team this player handed in. */
  onTeamResult(result: { ok: boolean; errors: string[] }): void;
  onConnection(state: ConnectionState): void;
  /** The server turned us away (room full, no such battle, bad code): nothing will work, don't retry. */
  onError(error: { code: string; message: string }): void;
}

const secureHost = (host: string) => !/^(localhost|127\.|\[::1\]|10\.|192\.168\.)/.test(host);
const BACKOFF_MS = [400, 800, 1500, 3000, 5000];

export function startOnlineBattle(options: OnlineOptions, events: OnlineEvents): { destroy(): void } {
  let socket: WebSocket | null = null;
  let destroyed = false;
  let fatal = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const send = (message: ClientMessage) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const connect = () => {
    if (destroyed) return;
    events.onConnection(attempt === 0 && !ready ? "connecting" : "reconnecting");
    const ws = new WebSocket(`${secureHost(options.host) ? "wss" : "ws"}://${options.host}/parties/battle-room/${options.code}`);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      events.onConnection("open");
      send({ type: "hello", clientId: options.clientId, name: options.name, config: options.create });
      // A keep-alive, so a connection quietly dropped by a phone or a proxy is noticed.
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => send({ type: "ping" }), 25_000);
    };
    ws.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      handle(message);
    };
    ws.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (destroyed || fatal) return;
      events.onConnection("reconnecting");
      timer = setTimeout(connect, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
    };
    ws.onerror = () => {
      /* onclose follows and retries */
    };
  };

  const handle = (message: ServerMessage) => {
    switch (message.type) {
      case "welcome": {
        if (ready) return; // a reconnect: the same seat, the screen already exists
        ready = true;
        const dex = Dex.forFormat(formatByKey(message.config.formatKey).formatId.split("@@@")[0]);
        const lookups = makeLookups(dex);
        const source: LocalBattle = {
          lookups,
          moveDetails(name) {
            const move = dex.moves.get(name);
            return { name: move.name, type: move.exists ? move.type.toLowerCase() : "normal", category: move.category, basePower: move.basePower, accuracy: move.accuracy, description: move.shortDesc || move.desc || "" };
          },
          itemText: (name) => dex.items.get(name).shortDesc || "",
          abilityText: (name) => dex.abilities.get(name).shortDesc || "",
          choose: (choice, rqid) => send({ type: "choose", choice, rqid: rqid ?? 0 }),
          forfeit: () => send({ type: "forfeit" }),
          submitTeam: (packed) => send({ type: "team", packed }),
          withdrawTeam: () => send({ type: "unready" }),
          destroy: () => destroy(),
        };
        events.onReady(source, { side: message.side, config: message.config, name: message.name });
        return;
      }
      case "status":
        return events.onStatus({ phase: message.phase, players: message.players });
      case "team-result":
        return events.onTeamResult({ ok: message.ok, errors: message.errors });
      case "battle":
        return events.onMessage({ lines: message.lines, request: message.request ? parseRequest(message.request) : null, error: message.error, instant: message.instant });
      case "error":
        fatal = true;
        events.onError({ code: message.code, message: message.message });
        return;
      case "pong":
        return;
    }
  };

  const destroy = () => {
    destroyed = true;
    if (timer) clearTimeout(timer);
    if (heartbeat) clearInterval(heartbeat);
    events.onConnection("closed");
    try {
      socket?.close();
    } catch {
      /* already closed */
    }
  };

  connect();
  return { destroy };
}
