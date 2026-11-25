"use client";

/**
 * Application chrome: a compact sidebar on desktop, a slide-over drawer on
 * mobile, and a quiet top bar with the current page title, Reset and theme
 * toggle.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Compass,
  Home,
  Menu,
  Moon,
  Network,
  RotateCcw,
  Route,
  Sun,
  User,
  X,
} from "lucide-react";

import { Button, cn } from "@/components/ui";
import { useVoca } from "@/components/providers";

const NAV = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/understand", label: "Understand", icon: Compass, numeral: "01", stage: "blue" },
  { href: "/dashboard", label: "Skill graph", icon: Network },
  { href: "/plan", label: "Plan", icon: Route, numeral: "02", stage: "violet" },
  { href: "/opportunities", label: "Act", icon: Compass, numeral: "03", stage: "green" },
  { href: "/profile", label: "Profile", icon: User },
] as const;

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/understand": "Understand",
  "/dashboard": "Skill graph",
  "/plan": "Plan",
  "/opportunities": "Act",
  "/profile": "Profile",
};

const STAGE_TEXT = {
  blue: "text-[var(--blue)]",
  violet: "text-[var(--violet)]",
  green: "text-[var(--green)]",
} as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resetAll, theme, toggleTheme, state } = useVoca();
  const [menuOpen, setMenuOpen] = useState(false);

  const pageTitle = TITLES[pathname] ?? TITLES["/"];
  const wide = pathname === "/dashboard";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function onReset() {
    resetAll();
    router.push("/");
  }

  const progress = state.plan ? "Stage 3" : state.skills.length ? "Stage 1 done" : "Not started";

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r border-[var(--border)] bg-[var(--bg)] px-4 py-7 lg:flex">
        <SidebarContent pathname={pathname} progress={progress} />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/35"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-[var(--border)] bg-[var(--bg)] px-4 py-4 shadow-[var(--shadow-elevated)]">
            <div className="mb-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent pathname={pathname} progress={progress} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[220px]">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-[8px]">
          <div
            className={cn(
              "mx-auto flex h-16 w-full items-center gap-2 px-4 sm:px-6",
              wide ? "max-w-[1280px]" : "max-w-[960px]",
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[14px] font-medium tracking-[-0.01em] text-[var(--text)]">
                {pageTitle}
              </h1>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={onReset}
              title="Clear this browser's Voca data"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          </div>
        </header>

        <main
          key={pathname}
          className={cn(
            "page-container animate-page-in",
            wide && "max-w-[1280px]",
          )}
        >
          {children}
        </main>

        <footer
          className={cn(
            "mx-auto w-full px-4 pb-8 font-mono-ui text-[10px] text-[var(--text-4)] sm:px-6 no-print",
            wide ? "max-w-[1280px]" : "max-w-[960px]",
          )}
        >
          Seed catalogue only. Trend labels are estimates, not live labour-market data.
        </footer>
      </div>
    </div>
  );
}

function SidebarContent({ pathname, progress }: { pathname: string; progress: string }) {
  return (
    <>
      <Link
        href="/"
        className="flex h-8 items-center gap-2 rounded-[6px] px-3 transition-colors hover:bg-[var(--hover-fill)]"
      >
        <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-[var(--brand)] text-[12px] font-semibold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
          v
        </span>
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text)]">
          VOCA
        </span>
      </Link>

      <nav className="mt-10 flex-1 space-y-0.5" aria-label="Main">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const numeral = "numeral" in item ? item.numeral : undefined;
          const stage = "stage" in item ? STAGE_TEXT[item.stage] : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors duration-150",
                active
                  ? "bg-[var(--active-fill)] text-[var(--text)]"
                  : "text-[var(--text-3)] hover:bg-[var(--hover-fill)] hover:text-[var(--text)]",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--brand)]"
                />
              ) : null}
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {numeral ? (
                <span
                  className={cn(
                    "font-mono-ui shrink-0 text-[10px]",
                    active && stage ? stage : "text-[var(--text-4)]",
                  )}
                >
                  {numeral}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 rounded-[8px] border border-[var(--border)] bg-[var(--panel)] p-3.5">
        <p className="font-mono-ui text-[10px] text-[var(--yellow)]">{progress}</p>
        <p className="mt-1.5 text-[10px] leading-[1.6] text-[var(--text-3)]">
          Your work is saved in this browser. No account needed.
        </p>
      </div>
    </>
  );
}
