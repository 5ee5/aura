"use client";

import { CalendarDays, MessageSquare, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Add a section here only once its page exists.
const SECTIONS = [
  { href: "/", label: "Coach", Icon: MessageSquare, also: [] },
  // The workout list and the Studio are reached from the calendar.
  { href: "/calendar", label: "Calendar", Icon: CalendarDays, also: ["/workouts", "/plans", "/analytics", "/recovery"] },
  { href: "/profile", label: "Profile", Icon: UserRound, also: [] },
] as const;

const current = (pathname: string, href: string, also: readonly string[]) =>
  pathname === href || also.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/** Tabs in the top bar on phones, a list in the side rail on wider screens. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="col-start-2 row-start-1 flex justify-end border-b border-line bg-surface pr-1 md:col-start-1 md:row-start-2 md:block md:border-r md:border-b-0 md:pr-0"
    >
      <ul className="flex md:flex-col md:gap-1">
        {SECTIONS.map(({ href, label, Icon, also }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={current(pathname, href, also) ? "page" : undefined}
              className="flex h-full items-center gap-2 border-b-2 border-transparent px-3 max-[400px]:px-2 text-sm text-muted -outline-offset-2 hover:text-foreground aria-[current=page]:border-accent aria-[current=page]:text-foreground md:h-10 md:gap-3 md:border-b-0 md:border-l-2 md:px-4"
            >
              {/* Words only on the narrowest phones, so three fit. */}
              <Icon aria-hidden className="size-5 max-[400px]:hidden" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
