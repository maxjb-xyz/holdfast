import Link from "next/link";
import { Icon, type IconName } from "./icons";

const NAV: { label: string; href: string; icon: IconName }[] = [
  { label: "League", href: "/league", icon: "chart" },
  { label: "Profile", href: "/profile", icon: "user" },
  { label: "Wrapped", href: "/wrapped", icon: "spark" },
];

export type Section = "League" | "Profile" | "Wrapped" | null;

export function Wordmark({ href = "/league" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center text-[15px] font-semibold tracking-[-0.01em]"
    >
      Holdfast
    </Link>
  );
}

/** Desktop header and the compact phone top bar. */
export function Header({
  active,
  initial,
  status,
}: {
  active: Section;
  initial: string;
  status: string;
}) {
  return (
    <header className="flex items-center justify-between gap-x-8 px-5 pt-1.5 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-10 lg:py-3.5">
      <Wordmark />
      <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active === item.label ? "page" : undefined}
            className={`hover-text flex min-h-11 items-center font-medium ${
              active === item.label ? "text-text" : "text-dim"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1.5 lg:justify-self-end lg:gap-[18px]">
        <span className="hidden items-center gap-1.5 font-mono text-[11px] text-grey lg:flex">
          <Icon name="sync" size={13} />
          {status}
        </span>
        <Link
          href="/leagues"
          className="hidden min-h-9 items-center gap-1.5 rounded-full bg-text pr-3.5 pl-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-white lg:flex"
        >
          <Icon name="plus" size={15} stroke={2} />
          Invite
        </Link>
        <Link
          href="/leagues"
          aria-label="Leagues and invites"
          className="hover-text flex size-11 items-center justify-center text-sub lg:hidden"
        >
          <Icon name="userPlus" size={19} />
        </Link>
        <Link
          href="/profile"
          aria-label="Your profile"
          className="flex size-8 items-center justify-center rounded-full border border-rule text-xs font-semibold transition-colors hover:border-grey"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}

/** The floating pill of tabs on phones. */
export function TabBar({ active }: { active: Section }) {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 rounded-full border border-rule bg-raised p-1 lg:hidden"
    >
      {NAV.map((item) =>
        item.label === active ? (
          <Link
            key={item.href}
            href={item.href}
            aria-current="page"
            className="flex min-h-11 items-center gap-2 rounded-full bg-text pr-[18px] pl-3.5 text-[13px] font-semibold text-bg"
          >
            <Icon name={item.icon} size={17} stroke={1.7} />
            {item.label}
          </Link>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            className="hover-text flex min-h-11 w-[52px] items-center justify-center rounded-full text-dim"
          >
            <Icon name={item.icon} size={19} stroke={1.6} />
          </Link>
        ),
      )}
    </nav>
  );
}

/** Label and value on one hairline row. */
export function Fact({
  label,
  value,
  quiet = false,
}: {
  label: string;
  value: string;
  quiet?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-faint py-[9px]">
      <span className="text-dim">{label}</span>
      <span className={`font-mono text-[13px] ${quiet ? "text-sub" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function SectionHead({
  title,
  aside,
}: {
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-4 items-center justify-between gap-4">
      <h2 className="label m-0 font-normal">{title}</h2>
      {aside && (
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-grey">
          {aside}
        </span>
      )}
    </div>
  );
}

/** The headline return: big light numerals with a quieter percent sign. */
export function BigReturn({
  text,
  className,
  signClassName,
}: {
  /** Already formatted without the percent sign, such as "+4.82". */
  text: string;
  className: string;
  signClassName: string;
}) {
  return (
    <span className={`numeral ${className}`}>
      {text}
      <span className={`tracking-normal text-dim ${signClassName}`}>%</span>
    </span>
  );
}
