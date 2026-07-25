import { ScanIcon } from "@/components/Icons";
import { SignOutButton } from "@/components/SignOutButton";
import UserAvatar from "@/components/UserAvatar";
import Link from "next/link";

interface SiteHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null;
  // the dashboard is already the dashboard, so it hides its own link
  showDashboardLink?: boolean;
}

export default function SiteHeader({
  user,
  showDashboardLink = false,
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-void/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight text-ink"
        >
          <ScanIcon size={16} className="text-green" />
          khoj<span className="caret">_</span>
        </Link>

        <div className="flex items-center gap-4">
          <span className="mono-label hidden items-center gap-2 sm:flex">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-green"
              style={{ boxShadow: "0 0 8px var(--green)" }}
            />
            online · llama-3.1 · gemini-embed
          </span>

          {user ? (
            <div className="flex items-center gap-3">
              {showDashboardLink && (
                <Link
                  href="/dashboard"
                  className="text-sm text-muted transition-colors hover:text-ink"
                >
                  Dashboard
                </Link>
              )}
              <UserAvatar
                name={user.name}
                email={user.email}
                avatarUrl={user.avatarUrl}
              />
              <span className="hidden text-sm text-muted sm:block">
                {user.name || user.email}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-line-bright bg-panel-2 px-3 py-1.5 text-sm text-muted transition-colors hover:border-green/50 hover:text-green"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
