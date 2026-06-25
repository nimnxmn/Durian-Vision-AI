"use client";

import { useState } from "react";
import { Sprout, Upload } from "lucide-react";

import { Controls } from "@/components/controls";
import { ResultCard } from "@/components/result-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { detectImage, type DetectResponse } from "@/lib/api";

type Item = {
  id: number;
  fileName: string;
  status: "loading" | "done" | "error";
  result?: DetectResponse;
  error?: string;
};

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [conf, setConf] = useState(0.25);
  const [iou, setIou] = useState(0.5);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  async function detectFiles(target: File[]) {
    if (target.length === 0) return;
    setLoading(true);

    const initial: Item[] = target.map((f, i) => ({
      id: i,
      fileName: f.name,
      status: "loading",
    }));
    setItems(initial);

    await Promise.all(
      target.map(async (file, i) => {
        try {
          const result = await detectImage(file, conf, iou);
          setItems((prev) =>
            prev.map((it) =>
              it.id === i ? { ...it, status: "done", result } : it,
            ),
          );
        } catch (err) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === i
                ? {
                    ...it,
                    status: "error",
                    error: err instanceof Error ? err.message : String(err),
                  }
                : it,
            ),
          );
        }
      }),
    );

    setLoading(false);
  }

  async function runDetection() {
    await detectFiles(files);
  }

  async function tryDemo() {
    try {
      const res = await fetch("/demo.jpg");
      if (!res.ok) throw new Error(`Demo image not found (HTTP ${res.status})`);
      const blob = await res.blob();
      const demoFile = new File([blob], "demo_image.jpg", { type: "image/jpeg" });
      setFiles([demoFile]);
      await detectFiles([demoFile]);
    } catch (err) {
      setItems([
        {
          id: 0,
          fileName: "demo_image.jpg",
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        },
      ]);
    }
  }

  const doneItems = items.filter((it) => it.status === "done" && it.result);
  const totalCount = doneItems.reduce(
    (sum, it) => sum + (it.result?.count ?? 0),
    0,
  );
  const totalTimeMs = doneItems.reduce(
    (sum, it) => sum + (it.result?.inference_ms ?? 0),
    0,
  );
  const allDetections = doneItems.flatMap((it) => it.result?.detections ?? []);
  const avgConf =
    allDetections.length > 0
      ? allDetections.reduce((s, d) => s + d.conf, 0) / allDetections.length
      : 0;

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sprout className="size-6 text-primary" aria-hidden />
            <span className="font-semibold tracking-tight">DurianVision AI</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <section className="w-full border-b bg-primary/10">
        <div className="mx-auto max-w-5xl px-6 py-12 flex flex-col gap-6">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Detect and count durians from under-canopy photos.
          </h1>

          <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Model performance</p>
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-bold tabular-nums">95.7%</div>
                  <div className="text-xs text-muted-foreground">Precision</div>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">91.6%</div>
                  <div className="text-xs text-muted-foreground">Recall</div>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">0.959</div>
                  <div className="text-xs text-muted-foreground">mAP50</div>
                </div>
              </div>
            </div>

            <div className="sm:border-l sm:pl-10">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">How to use</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Upload under-canopy durian tree photos — the model marks every
                visible durian and returns an exact count.
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-5xl px-6 py-10 flex-1">

        <Controls
          files={files}
          conf={conf}
          iou={iou}
          loading={loading}
          onFilesChange={setFiles}
          onConfChange={setConf}
          onIouChange={setIou}
          onSubmit={runDetection}
          onTryDemo={tryDemo}
        />

        {items.length > 1 && (
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Images
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {items.length}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total durians
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {totalCount}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Avg confidence
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {allDetections.length > 0 ? avgConf.toFixed(2) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total inference
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {totalTimeMs > 0 ? `${totalTimeMs.toFixed(0)} ms` : "—"}
              </div>
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border/60 py-16 text-center">
            <Upload className="size-10 text-muted-foreground/50" />
            <p className="font-medium">Ready when you are</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <ResultCard
              key={it.id}
              fileName={it.fileName}
              status={it.status}
              result={it.result}
              error={it.error}
            />
          ))}
        </div>
      </main>

      <footer className="border-t mt-10">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-muted-foreground">
          Built with FastAPI · Next.js · YOLOv8 · shadcn/ui.
        </div>
      </footer>
    </div>
  );
}
