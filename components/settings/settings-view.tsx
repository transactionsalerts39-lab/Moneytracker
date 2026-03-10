"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, RefreshCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getBillingCycleStartDay } from "@/lib/finance";
import { db, ensureSeedData, resetAllLocalData, setSettingValue } from "@/lib/storage/db";

export function SettingsView() {
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  const rules = useLiveQuery(() => db.rules.toArray(), []);
  const mappings = useLiveQuery(() => db.fileMappings.toArray(), []);
  const showExcluded = Boolean(settings?.find((setting) => setting.key === "showExcludedInCharts")?.value);
  const savedBillingCycleStartDay = getBillingCycleStartDay(settings);
  const [billingCycleStartDayInput, setBillingCycleStartDayInput] = useState(String(savedBillingCycleStartDay));

  useEffect(() => {
    setBillingCycleStartDayInput(String(savedBillingCycleStartDay));
  }, [savedBillingCycleStartDay]);

  async function handleReset() {
    await resetAllLocalData();
    await ensureSeedData();

    toast.success("Local data reset", {
      description: "The demo dataset has been reloaded into IndexedDB.",
    });
  }

  async function handleBillingCycleSave() {
    const parsedValue = Number(billingCycleStartDayInput);

    if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 31) {
      toast.error("Invalid billing cycle day", {
        description: "Use a whole-number day between 1 and 31.",
      });
      return;
    }

    await setSettingValue("billingCycleStartDay", parsedValue);
    toast.success("Billing cycle saved", {
      description: `The dashboard now treats day ${parsedValue} as the credit-card cycle start.`,
    });
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border-b border-slate-200/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Settings</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Control the local rules engine.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            These settings are already backed by local IndexedDB. Rule editing, file-mapping management, and export file
            generation are the next pieces to wire.
          </p>
        </div>
        <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">
          Browser-only persistence
        </Badge>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-slate-500" />
              Spend display
            </CardTitle>
            <CardDescription>Decide whether excluded rows should appear in charts.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between rounded-[24px] bg-slate-50 px-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Show excluded rows in charts</p>
              <p className="text-xs text-slate-500">Currently seeded as {showExcluded ? "on" : "off"}.</p>
            </div>
            <Switch checked={showExcluded} disabled />
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Billing cycle</CardTitle>
            <CardDescription>Anchor credit-card billing totals to the day your cycle starts each month.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 rounded-[24px] bg-slate-50 px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Cycle start day</p>
              <p className="mt-1 text-xs text-slate-500">Transactions and dashboard totals now use this for current card-cycle drill-downs.</p>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={31}
                value={billingCycleStartDayInput}
                onChange={(event) => setBillingCycleStartDayInput(event.target.value)}
                className="w-24 rounded-xl border-slate-200 bg-white"
              />
              <Button className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => void handleBillingCycleSave()}>
                Save day
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Local data controls</CardTitle>
            <CardDescription>Reset the browser database or export data in the next slice.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button className="rounded-full bg-slate-900 text-white hover:bg-slate-800" onClick={() => void handleReset()}>
              <RefreshCcw className="mr-2 size-4" />
              Reset local data
            </Button>
            <Button variant="outline" className="rounded-full border-slate-200" disabled>
              <Download className="mr-2 size-4" />
              Export JSON / CSV
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Category rules</CardTitle>
            <CardDescription>Default merchant keyword rules seeded locally.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules?.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{rule.keyword}</p>
                  <p className="text-xs text-slate-500">Category: {rule.category}</p>
                </div>
                <Badge variant="secondary" className="rounded-full">
                  priority {rule.priority}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Saved mappings</CardTitle>
            <CardDescription>Header-signature-based mapping records for CSV/XLSX imports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mappings?.map((mapping) => (
              <div key={mapping.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">{mapping.sourceType.replace("_", " ")}</p>
                <p className="mt-1 text-xs text-slate-500">{mapping.headerSignature}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
