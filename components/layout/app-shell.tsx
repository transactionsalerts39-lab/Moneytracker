"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { workspaceNavItems } from "@/components/layout/navigation";
import { useViewportMode } from "@/lib/ui/viewport-mode";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedMode, preference, isAuto } = useViewportMode();

  if (resolvedMode === "mobile") {
    const activeItem =
      workspaceNavItems.find((item) => pathname.startsWith(item.href)) ?? workspaceNavItems[0];

    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(207,216,228,0.5),_transparent_44%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_48%,_#f8fafc_100%)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
          <header className="sticky top-[env(safe-area-inset-top)] z-30 mb-4 rounded-[28px] border border-white/75 bg-white/90 px-4 py-4 shadow-[0_16px_48px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                  Moneytracker
                </p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  {activeItem.label}
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  {isAuto ? "Auto mobile view" : `${preference} view override`} on this browser only.
                </p>
              </div>
              <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50">
                Local only
              </Badge>
            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/80 bg-white/92 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto grid max-w-[640px] grid-cols-4 gap-2">
            {workspaceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition",
                    isActive
                      ? "bg-slate-900 text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)]"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(207,216,228,0.45),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_48%,_#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 py-4 md:px-6 lg:flex-row lg:gap-6 lg:px-8">
        <aside className="mb-4 rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:sticky lg:top-4 lg:mb-0 lg:h-[calc(100vh-2rem)] lg:w-[280px] lg:p-6">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Moneytracker</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Private finance cockpit</h1>
            </div>
            <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50">
              Local only
            </Badge>
          </div>

          <nav className="space-y-2">
            {workspaceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition",
                    isActive
                      ? "bg-slate-900 text-white shadow-[0_16px_28px_rgba(15,23,42,0.18)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="size-4" />
                    {item.label}
                  </span>
                  {isActive ? <span className="size-2 rounded-full bg-emerald-300" /> : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-[24px] bg-slate-950 px-5 py-5 text-slate-50">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-2">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Privacy-first setup</p>
                <p className="text-xs text-slate-300">No bank sync, no cloud storage, browser-only data.</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
