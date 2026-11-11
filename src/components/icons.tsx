import type { ReactNode } from "react";

/** Thin stroke icons on a 24px grid. Decorative unless given a label. */
const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.5" />
    </>
  ),
  sync: (
    <path d="M20 11a8 8 0 0 0-14.5-4M4 4v3.5h3.5M4 13a8 8 0 0 0 14.5 4M20 20v-3.5h-3.5" />
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5" />
    </>
  ),
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  pause: <path d="M9 5v14M15 5v14" />,
  userPlus: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c1-3.4 3.6-5 6.5-5s5.5 1.6 6.5 5M18 8v6M15 11h6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  right: <path d="M9 6l6 6-6 6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chart: <path d="M4 19h16M5 15l4-5 4 3 6-8" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" />
    </>
  ),
  spark: (
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.500l2.5 2.500M15 15l2.5 2.500M17.5 6.5 15 9M9 15l-2.5 2.5" />
  ),
  check: <path d="M5 12.500l4.5 4.500L19 7.5" />,
  link: (
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700L11.5 6.800M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.700l1.5-1.5" />
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  stroke = 1.5,
  className,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className ?? ""}`}
    >
      {PATHS[name]}
    </svg>
  );
}
