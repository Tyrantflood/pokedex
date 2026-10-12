"use client";

import { useState } from "react";
import { battleSpriteUrls } from "@/lib/battle/ids";
import type { ParsedRequest, RequestMon } from "@/lib/battle/protocol";
import { TYPE_COLORS } from "@/lib/type-colors";
import type { PokemonType } from "@/lib/pokemon-types";
import type { BattleState } from "./use-local-battle";
import { HpBar, StatusChip, TypeChip } from "./ui";

type Special = "mega" | "ultra" | "z" | "dynamax" | "tera";
const SUFFIX: Record<Special, string> = { mega: " mega", ultra: " ultra", z: " zmove", dynamax: " dynamax", tera: " terastallize" };
const SPECIAL_LABEL: Record<Special, string> = { mega: "Mega Evolve", ultra: "Ultra Burst", z: "Z-Move", dynamax: "Dynamax", tera: "Terastallize" };

export function ActionPanel({ state, onChoose }: { state: BattleState; onChoose: (choice: string) => void }) {
  const { request, helpers, status, view, refused } = state;
  if (status === "loading") return <Notice>Loading the simulator…</Notice>;
  if (!request || !helpers) {
    return <Notice>{view.turn === 0 ? "Setting up the battle…" : "Watching the turn play out…"}</Notice>;
  }
  // Keyed by request, so the toggle resets for every turn.
  return <Choices key={request.rqid} request={request} helpers={helpers} onChoose={onChoose} refused={refused} />;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-white/10 bg-zinc-900/60 p-4 text-sm text-zinc-400" role="status">
      {children}
    </div>
  );
}

function Choices({ request, helpers, onChoose, refused }: { request: ParsedRequest; helpers: NonNullable<BattleState["helpers"]>; onChoose: (choice: string) => void; refused: string | null }) {
  const [special, setSpecial] = useState<Special | null>(null);
  const active = request.active;
  const forced = request.forceSwitch || !active;
  const canSwitch = (member: RequestMon) => !member.active && !member.fainted && (forced || !active?.trapped);

  const specials: { key: Special; label: string }[] = [];
  if (active) {
    if (active.canMega) specials.push({ key: "mega", label: SPECIAL_LABEL.mega });
    if (active.canUltra) specials.push({ key: "ultra", label: SPECIAL_LABEL.ultra });
    if (active.zMoves.some(Boolean)) specials.push({ key: "z", label: SPECIAL_LABEL.z });
    if (active.canDynamax) specials.push({ key: "dynamax", label: SPECIAL_LABEL.dynamax });
    if (active.canTera) specials.push({ key: "tera", label: `Terastallize · ${active.canTera}` });
  }
  // Mega Evolution and Ultra Burst happen on their own; they are not a choice the player can decline, so they are just on.
  const optional = specials.filter((s) => s.key !== "mega" && s.key !== "ultra");
  const automatic = specials.find((s) => s.key === "mega" || s.key === "ultra");

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3 sm:p-4">
      {forced ? (
        <p className="mb-2 text-sm font-semibold text-teal-100">{request.active ? "Choose your next Pokémon" : "Your Pokémon fainted. Choose the next one."}</p>
      ) : (
        <>
          <div className="mb-2 flex min-h-7 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Moves</span>
            {automatic && <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[11px] font-semibold text-teal-200">{automatic.label} this turn</span>}
            {optional.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={special === s.key}
                onClick={() => setSpecial(special === s.key ? null : s.key)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${special === s.key ? "border-teal-300 bg-teal-300/20 text-teal-100" : "border-white/15 text-zinc-300 hover:border-white/30"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {active.moves.map((slot, i) => {
              let name = slot.name;
              let blocked = slot.disabled || slot.pp === 0;
              if (special === "z") {
                const z = active.zMoves[i];
                if (z) name = z;
                else blocked = true;
              }
              if (special === "dynamax" && active.maxMoves?.[i]) name = active.maxMoves[i];
              const details = helpers.moveDetails(name);
              const color = TYPE_COLORS[details.type as PokemonType] ?? "#68a090";
              const suffix = special ? SUFFIX[special] : automatic ? SUFFIX[automatic.key] : "";
              return (
                <button
                  key={slot.id + i}
                  type="button"
                  disabled={blocked}
                  onClick={() => onChoose(`move ${i + 1}${suffix}`)}
                  title={details.description}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-800/80 p-2.5 pl-4 text-left transition-colors hover:border-white/30 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-white">{name}</span>
                    <TypeChip type={details.type} />
                  </span>
                  <span className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                    <span>
                      {details.category === "Status" ? "Status" : `${details.category} · ${details.basePower || "—"} BP`}
                      {details.accuracy !== true && details.category !== "Status" ? ` · ${details.accuracy}%` : ""}
                    </span>
                    <span className="tabular-nums">{slot.pp !== null && slot.maxPp ? `${slot.pp}/${slot.maxPp} PP` : ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-3">
        {!forced && <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">{active?.trapped ? "Trapped: you can't switch" : "Switch to"}</div>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {request.team.map((member, i) => (
            <TeamTile key={member.nickname} member={member} index={i + 1} enabled={canSwitch(member)} helpers={helpers} onChoose={onChoose} />
          ))}
        </div>
      </div>
      {refused && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          That choice wasn&apos;t allowed ({refused.replace(/^\[.*?\]\s*/, "") || "try another"}).
        </p>
      )}
    </div>
  );
}

function TeamTile({ member, index, enabled, helpers, onChoose }: { member: RequestMon; index: number; enabled: boolean; helpers: NonNullable<BattleState["helpers"]>; onChoose: (choice: string) => void }) {
  const fraction = member.maxHp ? member.hp / member.maxHp : 0;
  const title = [
    `${member.species} Lv ${member.level}${member.fainted ? " (fainted)" : ""}`,
    member.ability && `Ability: ${member.ability} — ${helpers.abilityText(member.ability)}`,
    member.item && `Item: ${member.item} — ${helpers.itemText(member.item)}`,
    member.moves.length && `Moves: ${member.moves.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onChoose(`switch ${index}`)}
      title={title}
      aria-label={`Switch to ${member.species}, ${Math.round(fraction * 100)}% HP${member.fainted ? ", fainted" : member.active ? ", in battle" : ""}`}
      className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-teal-300 ${
        member.active ? "border-teal-300/50 bg-teal-300/10" : "border-white/10 bg-zinc-800/60"
      } ${enabled ? "hover:border-white/30 hover:bg-zinc-800" : "cursor-not-allowed"} ${member.fainted ? "opacity-40" : !enabled && !member.active ? "opacity-60" : ""}`}
    >
      <TileSprite spriteId={helpers.lookups.species(member.species).spriteId} />
      <span className="w-full truncate text-[11px] font-semibold text-white">{member.species}</span>
      <HpBar fraction={fraction} className="w-full" />
      <StatusChip status={member.status} />
    </button>
  );
}

function TileSprite({ spriteId }: { spriteId: number }) {
  const url = spriteId ? battleSpriteUrls(spriteId, "front")[1] : null;
  return (
    <span className="grid size-12 place-items-center">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- small third-party pixel sprite
        <img src={url} alt="" draggable={false} className="max-h-12 max-w-12 select-none" style={{ imageRendering: "pixelated" }} />
      )}
    </span>
  );
}