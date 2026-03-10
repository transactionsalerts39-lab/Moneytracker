"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, Cog, FolderUp, Rows3, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  { href: "/upload", label: "Upload", icon: FolderUp },
  { href: "/transactions", label: "Transactions", icon: Rows3 },
  { href: "/settings", label: "Settings", icon: Cog },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
            {navItems.map((item) => {
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
