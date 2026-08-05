// SVG icons ported verbatim from the design prototype.
import * as React from "react";

type P = React.SVGProps<SVGSVGElement> & { size?: number };

function base(size: number, props: P) {
  const { size: _s, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function HomeIcon(props: P) {
  const s = props.size ?? 20;
  return (
    <svg {...base(s, props)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

export function GridIcon(props: P) {
  const s = props.size ?? 20;
  return (
    <svg {...base(s, props)}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function TrophyIcon(props: P) {
  const s = props.size ?? 20;
  return (
    <svg {...base(s, props)}>
      <path d="M7 4h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
      <path d="M12 13v3M9 20h6M9 20l.5-3M15 20l-.5-3" />
    </svg>
  );
}

export function PeopleIcon(props: P) {
  const s = props.size ?? 20;
  return (
    <svg {...base(s, props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2c2.6.4 4.5 2.6 4.5 5.8" />
    </svg>
  );
}

export function CalendarIcon(props: P) {
  const s = props.size ?? 20;
  return (
    <svg {...base(s, props)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  );
}

export function LockIcon(props: P) {
  const s = props.size ?? 16;
  return (
    <svg {...base(s, props)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function CheckIcon(props: P) {
  const s = props.size ?? 13;
  return (
    <svg {...base(s, { strokeWidth: 2.5, ...props })}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

export function ChevronRight(props: P) {
  const s = props.size ?? 12;
  return (
    <svg {...base(s, { strokeWidth: 2, ...props })}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
