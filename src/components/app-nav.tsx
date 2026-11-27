"use client";

import { MessageSquare, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Add a section here only once its page exists.
const SECTIONS = [
  { href: "/", label: "Coach", Icon: MessageSquare },
  { href: "/profile", label: "Profile", Icon: UserRound },
] as const;

/** Bottom tabs on phones, a list in the side rail on wider screens. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:pb-0"
    >
      <ul className="flex md:flex-col md:gap-1">
        {SECTIONS.map(({ href, label, Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className="flex h-16 flex-col items-center justify-center gap-1 border-t-2 border-transparent text-sm text-muted -outline-offset-2 hover:text-foreground aria-[current=page]:border-accent aria-[current=page]:text-foreground md:h-10 md:flex-row md:justify-start md:gap-3 md:border-t-0 md:border-l-2 md:px-4"
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
