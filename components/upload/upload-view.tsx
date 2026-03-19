"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Eye, FileText, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importStatementFile, removeLatestImportBatch } from "@/lib/ingestion/import-statement";
import { getBatchHeadline } from "@/lib/finance";
import { db } from "@/lib/storage/db";
import type { UploadDraft } from "@/types/finance";

function detectFileType(file: File): UploadDraft["fileType"] {
  if (file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.name.toLowerCase().endsWith(".csv")) return "csv";
  if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) return "xlsx";
  return "unknown";
}

export function UploadView() {
  const importBatches = useLiveQuery(() => db.importBatches.orderBy("uploadedAt").reverse().toArray(), []);
  const storedStatementFiles = useLiveQuery(() => db.storedStatementFiles.orderBy("uploadedAt").reverse().toArray(), []);
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFileCount, setPendingFileCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const importBatchById = new Map((importBatches ?? []).map((batch) => [batch.id, batch]));
  const totalArchivedSize = (storedStatementFiles ?? []).reduce((total, file) => total + file.sizeBytes, 0);

  async function processFiles(files: File[]) {
    setIsLoading(true);
    setPendingFileCount(files.length);

    for (const file of files) {
      const draftId = `auto-${file.name}-${file.lastModified}`;
      const draft: UploadDraft = {
        id: draftId,
        sourceType: "auto",
        fileName: file.name,
        fileType: detectFileType(file),
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
      };

      setDrafts((current) => [draft, ...current]);

      try {
        const result = await importStatementFile(file);
        setDrafts((current) =>
          current.map((entry) => (entry.id === draftId ? { ...entry, sourceType: result.sourceType } : entry)),
        );
        setLastMessage(result.message);
        toast.success(`${result.sourceType === "savings" ? "Savings" : "Credit-card"} file imported`, {
          description: `${result.storedTransactions} net new rows • ${result.duplicatesSkipped} exact overlaps • file copy saved locally`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Import failed.";
        setLastMessage(message);
        toast.error("Statement import failed", { description: message });
      } finally {
        setPendingFileCount((current) => Math.max(current - 1, 0));
      }
    }

    setIsLoading(false);
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border-b border-slate-200/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Upload</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Stage statements with clear separation.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Uploads already parse locally for PDF, CSV, and XLSX. Each file is normalized into the canonical ledger, then
            overlap checks run before anything hits the dashboard totals. The original uploaded statement is also preserved
            inside IndexedDB, so deleting the filesystem PDF later does not remove imported history.
          </p>
        </div>
        <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">
          PDF support required in MVP
        </Badge>
      </section>

      <section>
        <UploadDropzone
          title="Statement File"
          description="Drop ICICI savings or credit-card PDF/CSV/XLSX files here; the app auto-detects the statement type."
          isLoading={isLoading}
          pendingFileCount={pendingFileCount}
          onDropFiles={processFiles}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Latest staged files</CardTitle>
            <CardDescription>
              Each selected file becomes its own local import batch before canonical dedupe is applied, then its source
              copy is archived in IndexedDB.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.length === 0 ? (
              <EmptyState text="Drop one or many statements here to preview filename, size, type, and timestamp." />
            ) : (
              drafts.map((draft) => (
                <div key={draft.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{draft.fileName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {draft.sourceType === "auto" ? "auto-detecting statement type" : draft.sourceType.replace("_", " ")}
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full uppercase">
                      {draft.fileType}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{(draft.fileSize / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span>{new Date(draft.uploadedAt).toLocaleString("en-IN")}</span>
                  </div>
                </div>
              ))
            )}
            {lastMessage ? (
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                {lastMessage}
              </div>
            ) : null}
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Exact overlaps are skipped using the canonical fingerprint: source, date, normalized description, and signed
              amount. Near-duplicates stay visible in the review queue instead of being auto-merged, and only net-new
              canonical rows are added.
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Recent import batches</CardTitle>
            <CardDescription>
              Multiple uploads are stored as separate batches, then reconciled against the shared ledger with explicit net-new counts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {importBatches?.map((batch) => (
              <div key={batch.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{batch.fileName}</p>
                    <p className="mt-1 text-xs text-slate-500">{getBatchHeadline(batch)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {batch.fileType.toUpperCase()} • {formatBytes(batch.fileSizeBytes ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(batch.uploadedAt).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="rounded-full capitalize">
                      {batch.sourceType.replace("_", " ")}
                    </Badge>
                    <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                      {batch.status.replace("_", " ")}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-slate-200"
                      onClick={async () => {
                        const removed = await removeLatestImportBatch(batch.sourceType);

                        if (removed) {
                          toast.success("Latest batch deleted", {
                            description: `${removed.fileName}, its archived file copy, and its batch data were removed from this browser.`,
                          });
                        }
                      }}
                    >
                      Delete latest
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Preserved statement archive</CardTitle>
            <CardDescription>
              {storedStatementFiles?.length
                ? `${storedStatementFiles.length} file copies saved in IndexedDB • ${formatBytes(totalArchivedSize)} archived locally`
                : "New uploads will keep a local statement copy here, separate from the canonical ledger."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!storedStatementFiles || storedStatementFiles.length === 0 ? (
              <EmptyState text="Once you upload a statement, its original file copy will be preserved locally so you can reopen or download it later." />
            ) : (
              storedStatementFiles.map((storedFile) => {
                const batch = importBatchById.get(storedFile.batchId);

                return (
                  <div key={storedFile.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{storedFile.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {storedFile.sourceType.replace("_", " ")} • {storedFile.fileType.toUpperCase()} • {formatBytes(storedFile.sizeBytes)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {batch
                            ? `${batch.rowsImported} net new rows • ${batch.duplicatesSkipped} exact overlaps • ${batch.rowsFlaggedForReview} review`
                            : "Archived file copy preserved locally"}
                        </p>
                        {storedFile.statementPeriodStart || storedFile.statementPeriodEnd ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Statement window {storedFile.statementPeriodStart ?? "?"} to {storedFile.statementPeriodEnd ?? "?"}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-400">{new Date(storedFile.uploadedAt).toLocaleString("en-IN")}</p>
                      </div>
                      <div className="flex gap-2">
                        {storedFile.fileType === "pdf" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-slate-200"
                            onClick={() => openStoredStatementFile(storedFile)}
                          >
                            <Eye className="mr-2 size-4" />
                            Open copy
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full border-slate-200"
                          onClick={() => downloadStoredStatementFile(storedFile)}
                        >
                          <Download className="mr-2 size-4" />
                          Download copy
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function UploadDropzone({
  title,
  description,
  isLoading,
  pendingFileCount,
  onDropFiles,
}: {
  title: string;
  description: string;
  isLoading: boolean;
  pendingFileCount: number;
  onDropFiles: (files: File[]) => Promise<void>;
}) {
  const dropzone = useDropzone({
    async onDropAccepted(files) {
      await onDropFiles(files);
    },
    onDropRejected() {
      toast.error("Unsupported file", {
        description: "Use PDF, CSV, XLSX, or Excel files for this slot.",
      });
    },
    accept: {
      "application/pdf": [".pdf"],
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: true,
    disabled: isLoading,
  });

  return (
    <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...dropzone.getRootProps()}
          className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-slate-400 hover:bg-slate-100"
        >
          <input {...dropzone.getInputProps()} />
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <UploadCloud className="size-5" />
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {isLoading
              ? `Importing ${Math.max(pendingFileCount, 1)} ${pendingFileCount === 1 ? "file" : "files"} locally…`
              : "Drop one or more PDF, CSV, or XLSX files"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {isLoading
              ? "Parsing, normalizing, deduplicating, and saving each file into IndexedDB in sequence."
              : "Each file is handled as its own batch, auto-routed to savings or credit-card parsing, and safely deduplicated against earlier uploads."}
          </p>
          <Button className="mt-5 rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800">
            {isLoading ? "Processing..." : "Choose files"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <FileText className="size-5 text-slate-500" />
      </div>
      <p className="mt-4 max-w-sm text-sm text-slate-500">{text}</p>
    </div>
  );
}

function formatBytes(value: number) {
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

function downloadStoredStatementFile(file: {
  blob: Blob;
  fileName: string;
}) {
  const objectUrl = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = file.fileName;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function openStoredStatementFile(file: {
  blob: Blob;
  fileType: "pdf" | "csv" | "xlsx";
}) {
  const objectUrl = URL.createObjectURL(file.blob);

  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
