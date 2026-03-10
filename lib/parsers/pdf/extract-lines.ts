import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfItem = {
  text: string;
  x: number;
  y: number;
};

export type PdfLine = {
  y: number;
  items: PdfItem[];
  text: string;
};

let workerConfigured = false;

export async function extractPdfLines(file: File) {
  ensurePdfWorker();

  const data = new Uint8Array(await file.arrayBuffer());
  const documentInit = {
    data,
    useSystemFonts: true,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0];
  const document = await pdfjs.getDocument(documentInit).promise;
  const pages: PdfLine[][] = [];

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str?: string; transform: number[] }>)
      .filter((item) => typeof item.str === "string")
      .map((item) => ({
        text: item.str?.trim() ?? "",
        x: Number(item.transform[4].toFixed(2)),
        y: Number(item.transform[5].toFixed(2)),
      }))
      .filter((item) => item.text.length > 0)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines: PdfLine[] = [];

    for (const item of items) {
      const existing = lines.find((line) => Math.abs(line.y - item.y) <= 3.5);

      if (existing) {
        existing.items.push(item);
        existing.items.sort((a, b) => a.x - b.x);
        existing.text = existing.items.map((entry) => entry.text).join(" ");
        continue;
      }

      lines.push({
        y: item.y,
        items: [item],
        text: item.text,
      });
    }

    lines.sort((a, b) => b.y - a.y);
    pages.push(lines);
  }

  return pages;
}

export function textInRange(line: PdfLine, start: number, end: number) {
  return line.items
    .filter((item) => item.x >= start && item.x < end)
    .map((item) => item.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstTextInRange(line: PdfLine, start: number, end: number) {
  return line.items.find((item) => item.x >= start && item.x < end)?.text?.trim() ?? "";
}

function ensurePdfWorker() {
  if (workerConfigured || typeof window === "undefined") {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  workerConfigured = true;
}
