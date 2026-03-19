"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Database, Download, RefreshCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getBillingCycleStartDay } from "@/lib/finance";
import { db, ensureSeedData, resetAllLocalData, setSettingValue } from "@/lib/storage/db";
import { useViewportMode, type ViewportModePreference } from "@/lib/ui/viewport-mode";

export function SettingsView() {
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  const rules = useLiveQuery(() => db.rules.toArray(), []);
  const mappings = useLiveQuery(() => db.fileMappings.toArray(), []);
  const importBatchCount = useLiveQuery(() => db.importBatches.count(), []);
  const transactionCount = useLiveQuery(() => db.transactions.count(), []);
  const rawRowCount = useLiveQuery(() => db.rawImportedRows.count(), []);
  const storedStatementFiles = useLiveQuery(() => db.storedStatementFiles.orderBy("uploadedAt").reverse().toArray(), []);
  const { preference, resolvedMode, setPreference } = useViewportMode();
  const showExcluded = Boolean(settings?.find((setting) => setting.key === "showExcludedInCharts")?.value);
  const savedBillingCycleStartDay = getBillingCycleStartDay(settings);
  const [billingCycleStartDayInput, setBillingCycleStartDayInput] = useState(String(savedBillingCycleStartDay));
  const [storageEstimate, setStorageEstimate] = useState<{ usage?: number; quota?: number }>({});
  const archivedFileBytes = (storedStatementFiles ?? []).reduce((total, file) => total + file.sizeBytes, 0);
  const remainingStorageBytes =
    typeof storageEstimate.quota === "number" && typeof storageEstimate.usage === "number"
      ? Math.max(storageEstimate.quota - storageEstimate.usage, 0)
      : undefined;

  useEffect(() => {
    setBillingCycleStartDayInput(String(savedBillingCycleStartDay));
  }, [savedBillingCycleStartDay]);

  useEffect(() => {
    let cancelled = false;

    async function loadStorageEstimate() {
      if (!navigator.storage?.estimate) {
        return;
      }

      const estimate = await navigator.storage.estimate();

      if (!cancelled) {
        setStorageEstimate({
          usage: estimate.usage,
          quota: estimate.quota,
        });
      }
    }

    void loadStorageEstimate();

    return () => {
      cancelled = true;
    };
  }, [archivedFileBytes, importBatchCount, rawRowCount, transactionCount]);

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
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Control the local rules engine.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            These settings are already backed by local IndexedDB. Rule editing, file-mapping management, and export file
            generation are the next pieces to wire.
          </p>
        </div>
        <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">
          Browser-only persistence
        </Badge>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
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
            <CardTitle>View mode</CardTitle>
            <CardDescription>Choose auto device detection or force a desktop/mobile layout in this browser only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 rounded-[24px] bg-slate-50 px-4 py-4">
            <Select value={preference} onValueChange={(value) => void setPreference((value as ViewportModePreference | undefined) ?? "auto")}>
              <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white">
                <SelectValue placeholder="View mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-slate-600">Current resolved view: <span className="font-semibold text-slate-900 capitalize">{resolvedMode}</span>.</p>
            <p className="text-xs leading-5 text-slate-500">
              This preference is saved only in the current browser/device. It does not sync across phones and laptops.
            </p>
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

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-slate-500" />
              Local storage
            </CardTitle>
            <CardDescription>See how much browser storage is being used by the local ledger and archived statement copies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 rounded-[24px] bg-slate-50 px-4 py-4">
            <StorageRow label="Site storage used" value={formatBytes(storageEstimate.usage)} />
            <StorageRow label="Storage remaining" value={formatBytes(remainingStorageBytes)} />
            <StorageRow label="Archived statement copies" value={`${storedStatementFiles?.length ?? 0} files • ${formatBytes(archivedFileBytes)}`} />
            <StorageRow label="Canonical transactions" value={`${transactionCount ?? 0}`} />
            <StorageRow label="Raw imported rows" value={`${rawRowCount ?? 0}`} />
            <StorageRow label="Import batches" value={`${importBatchCount ?? 0}`} />
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

      <section>
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Recent archived statements</CardTitle>
            <CardDescription>Original uploaded statement copies preserved inside IndexedDB, separate from the canonical ledger rows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!storedStatementFiles || storedStatementFiles.length === 0 ? (
              <p className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Upload a statement and its original file copy will appear here.
              </p>
            ) : (
              storedStatementFiles.slice(0, 6).map((file) => (
                <div key={file.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{file.fileName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {file.sourceType.replace("_", " ")} • {file.fileType.toUpperCase()} • {formatBytes(file.sizeBytes)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{new Date(file.uploadedAt).toLocaleString("en-IN")}</p>
                    </div>
                    <Badge variant="secondary" className="rounded-full uppercase">
                      IndexedDB
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StorageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[20px] border border-slate-200 bg-white px-3 py-3">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatBytes(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
