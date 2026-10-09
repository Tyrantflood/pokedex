/**
 * A plain human silhouette used as the size reference. The drawing spans exactly its viewBox from
 * the top of the head to the soles of the feet, so rendering it at (1.7 m x pixels-per-metre)
 * tall makes it a true 1.7 m person.
 */
export const HUMAN_ASPECT = 100 / 286;

export function HumanSilhouette({ height }: { height: number }) {
  return (
    <svg width={height * HUMAN_ASPECT} height={height} viewBox="0 0 100 286" aria-hidden className="block">
      {/* One group opacity, so overlapping limbs don't show up darker. */}
      <g fill="white" opacity="0.22">
        <circle cx="50" cy="17" r="17" />
        <rect x="45" y="30" width="10" height="12" rx="4" />
        <rect x="27" y="38" width="46" height="100" rx="16" />
        <rect x="11" y="42" width="13" height="92" rx="6.5" />
        <rect x="76" y="42" width="13" height="92" rx="6.5" />
        <rect x="30" y="128" width="19" height="158" rx="8" />
        <rect x="51" y="128" width="19" height="158" rx="8" />
      </g>
    </svg>
  );
}
