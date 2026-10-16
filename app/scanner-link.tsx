import Link from "next/link";

/** A link in the "field scanner" style: mono caps, teal outline, a small targeting reticle. Used to hop between the Pokédex and /battle. */
export function ScannerLink({ href, children, label, onClick }: { href: string; children: React.ReactNode; label?: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) {
  return (
    <Link
      href={href}
      aria-label={label}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-teal-300/40 bg-teal-300/5 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-teal-200 transition-colors hover:bg-teal-300/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
    >
      <svg width="14" height="14" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
        <circle cx="20" cy="20" r="14" />
        <circle cx="20" cy="20" r="5" />
        <path d="M20 2v8M20 30v8M2 20h8M30 20h8" />
      </svg>
      {children}
    </Link>
  );
}
