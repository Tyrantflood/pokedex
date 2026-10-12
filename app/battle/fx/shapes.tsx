import type { ParticleShape } from "@/lib/battle/move-fx";

/** One particle's picture, drawn in a 24x24 box. Plain fills and strokes only: no filters, so it stays cheap to animate. */
export function Shape({ shape, color, accent, size }: { shape: ParticleShape; color: string; accent: string; size: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const, style: { display: "block", overflow: "visible" } };
  switch (shape) {
    case "streak":
      return (
        <svg {...common}>
          <path d="M12 1 L13.4 12 L12 23 L10.6 12Z" fill={color} />
        </svg>
      );
    case "flame":
      return (
        <svg {...common}>
          <path d="M12 1 C16 7 21 11 18.5 17 C17 21.5 7 21.5 5.5 17 C4 12 9 9.5 12 1Z" fill={color} />
          <path d="M12 9 C14.5 12 16 14 14.5 17.5 C13.5 19.5 10.5 19.5 9.5 17.5 C8.5 14.5 11 13 12 9Z" fill={accent} />
        </svg>
      );
    case "drop":
      return (
        <svg {...common}>
          <path d="M12 1.5 C16.5 8.5 19.5 12 19.5 16 A7.5 7.5 0 0 1 4.5 16 C4.5 12 7.5 8.5 12 1.5Z" fill={color} />
          <ellipse cx="9.2" cy="15.5" rx="1.6" ry="2.6" fill={accent} opacity="0.85" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M14 1 L4.5 13.5 H11 L9 23 L19.5 9.5 H13Z" fill={color} stroke={accent} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "leaf":
      return (
        <svg {...common}>
          <path d="M3.5 21 C3 9 11 3 21.5 2.5 C21.5 12.5 16 20.5 3.5 21Z" fill={color} />
          <path d="M5 19.5 C10 15 14 11 18 6.5" stroke={accent} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "shard":
      return (
        <svg {...common}>
          <path d="M12 0.5 L17.5 12 L12 23.5 L6.5 12Z" fill={color} />
          <path d="M12 0.5 L17.5 12 L12 12Z" fill={accent} opacity="0.9" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 0.5 L14.6 9.4 L23.5 12 L14.6 14.6 L12 23.5 L9.4 14.6 L0.5 12 L9.4 9.4Z" fill={color} />
          <circle cx="12" cy="12" r="3" fill={accent} />
        </svg>
      );
    case "bubble":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill={color} fillOpacity="0.35" stroke={color} strokeWidth="2" />
          <circle cx="8.5" cy="8.5" r="2.2" fill={accent} />
        </svg>
      );
    case "dust":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="10" ry="8" fill={color} fillOpacity="0.7" />
          <ellipse cx="9" cy="10" rx="4" ry="3" fill={accent} fillOpacity="0.55" />
        </svg>
      );
    case "slash":
      return (
        <svg {...common}>
          <path d="M1.5 21 C7 6 15 2 23 3 C15.5 8 9 13.5 1.5 21Z" fill={color} />
          <path d="M5 17.5 C10 9 15.5 5.5 21 4.5" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "ring":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="2.6" />
          <circle cx="12" cy="12" r="6.5" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.8" />
        </svg>
      );
    case "dot":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="6" fill={color} />
          <circle cx="10" cy="10" r="2" fill={accent} />
        </svg>
      );
    case "rock":
      return (
        <svg {...common}>
          <path d="M5.5 5 L16 2.5 L21.5 11 L17.5 20.5 L7 21.5 L2.5 12.5Z" fill={color} />
          <path d="M5.5 5 L16 2.5 L13 11 L2.5 12.5Z" fill={accent} opacity="0.6" />
        </svg>
      );
    case "wisp":
      return (
        <svg {...common}>
          <path d="M12 1.5 C18.5 5.5 19 13.5 12.5 17.5 C10.5 19 8.5 21.5 5 22.5 C7.5 20 7.5 18 6 15.5 C3.5 10 7.5 4.5 12 1.5Z" fill={color} fillOpacity="0.85" />
          <circle cx="11.5" cy="10" r="1.6" fill={accent} />
          <circle cx="15.2" cy="10.6" r="1.3" fill={accent} />
        </svg>
      );
    case "claw":
      return (
        <svg {...common}>
          <path d="M3 2.5 L9.5 21.5 M10.5 1.5 L16.5 22 M17.5 2.5 L22 20" stroke={color} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <path d="M3 2.5 L9.5 21.5 M10.5 1.5 L16.5 22 M17.5 2.5 L22 20" stroke={accent} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.8" />
        </svg>
      );
    case "glint":
      return (
        <svg {...common}>
          <path d="M12 0 L13.6 10.4 L24 12 L13.6 13.6 L12 24 L10.4 13.6 L0 12 L10.4 10.4Z" fill={color} />
          <path d="M12 4 L12.8 11.2 L20 12 L12.8 12.8 L12 20 L11.2 12.8 L4 12 L11.2 11.2Z" fill={accent} />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M12 2 L21.5 13.5 H15.2 V22 H8.8 V13.5 H2.5Z" fill={color} />
          <path d="M12 6 L17 12 H13.4 V18 H10.6 V12 H7Z" fill={accent} opacity="0.8" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 1 C12.6 8 16 11.4 23 12 C16 12.6 12.6 16 12 23 C11.4 16 8 12.6 1 12 C8 11.4 11.4 8 12 1Z" fill={color} />
          <circle cx="12" cy="12" r="2.2" fill={accent} />
        </svg>
      );
  }
}
