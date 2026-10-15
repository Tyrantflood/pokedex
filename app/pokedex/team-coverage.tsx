"use client";

import { useMemo } from "react";
import type { PokemonType } from "@/lib/pokemon-types";
import { analyseTeam, type TypeChart, type TypeExposure } from "@/lib/team";
import { TYPE_COLORS } from "@/lib/type-colors";

export function TypePill({ type, children }: { type: PokemonType; children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-full text-[11px] font-semibold uppercase tracking-wide text-black/80" style={{ background: TYPE_COLORS[type] }}>
      <span className="px-2 py-0.5">{type}</span>
      {children}
    </span>
  );
}

function ExposureChip({ exposure, count, tone, members }: { exposure: TypeExposure; count: number; tone: "weak" | "resist"; members: string }) {
  return (
    <li title={members}>
      <TypePill type={exposure.type}>
        <span
          className="px-1.5 py-0.5 font-mono"
          style={{ background: tone === "weak" ? (exposure.worst >= 4 ? "#7f1d1d" : "#dc2626") : "#166534", color: "#fff" }}
          aria-label={`${count} ${count === 1 ? "member" : "members"}${tone === "weak" && exposure.worst >= 4 ? ", at least one takes four times damage" : ""}`}
        >
          {count}
          {tone === "weak" && exposure.worst >= 4 ? "·4×" : ""}
        </span>
      </TypePill>
    </li>
  );
}

export interface CoverageMember {
  name: string;
  types: PokemonType[];
}

/**
 * The team type coverage panel: what the whole team is weak to, resists, and has no answer for. Shared by the Pokédex team bar and the
 * battle team builder, so both read the same maths (`analyseTeam`). Without `chart` it is the site's modern chart (lib/type-chart.ts); the team
 * builder passes the format's own generation chart.
 */
export function CoverageSections({ members, chart }: { members: CoverageMember[]; chart?: TypeChart }) {
  const analysis = useMemo(() => analyseTeam(members.map((m) => m.types), chart), [members, chart]);

  /** "Charizard ×4, Blastoise ×2": who is behind a chip's number. */
  const who = (e: TypeExposure) =>
    members
      .map((p, i) => ({ name: p.name, m: e.perMember[i] }))
      .filter(({ m }) => m !== 1)
      .map(({ name, m }) => `${name} ${m === 0 ? "immune" : m === 0.25 ? "×¼" : m === 0.5 ? "×½" : `×${m}`}`)
      .join(", ");

  return (
    <>
      {analysis.flagged.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-400/60 bg-red-500/15 p-3">
          <p className="text-sm font-semibold text-red-100">⚠ The whole team is weak to {analysis.flagged.length === 1 ? "this type" : "these types"}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Types the whole team is weak to">
            {analysis.flagged.map((type) => (
              <li key={type}>
                <TypePill type={type} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-label="Team weaknesses">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">Weak to <span className="normal-case tracking-normal text-white/50">· how many members</span></h3>
        {analysis.weaknesses.length === 0 ? (
          <p className="text-sm text-white/60">Nothing yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {analysis.weaknesses.map((e) => (
              <ExposureChip key={e.type} exposure={e} count={e.weak} tone="weak" members={who(e)} />
            ))}
          </ul>
        )}
        {analysis.weaknesses.some((e) => e.worst >= 4) && <p className="mt-1.5 text-xs text-white/50">·4× means at least one of them takes four times the damage.</p>}
      </section>

      <section aria-label="Team resistances">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">Resists or immune <span className="normal-case tracking-normal text-white/50">· how many members</span></h3>
        {analysis.resistances.length === 0 ? (
          <p className="text-sm text-white/60">Nothing yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {analysis.resistances.map((e) => (
              <ExposureChip key={e.type} exposure={e} count={e.resist + e.immune} tone="resist" members={who(e)} />
            ))}
          </ul>
        )}
      </section>

      {analysis.gaps.length > 0 && (
        <section aria-label="Gaps">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">No answer on the team</h3>
          <p className="mb-1.5 text-xs text-white/60">Somebody is weak to these and nobody resists them.</p>
          <ul className="flex flex-wrap gap-1.5">
            {analysis.gaps.map((type) => (
              <li key={type}>
                <TypePill type={type} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
