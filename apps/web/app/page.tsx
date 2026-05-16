"use client";

import { useState } from "react";

import { Controls } from "@/components/controls";
import { ResultCard } from "@/components/result-card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
            <span aria-hidden className="text-2xl">🌲</span>
            <span className="font-semibold tracking-tight">DurianVision AI</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10 flex-1">
        <section className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
            Count durians from a single canopy photo.
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            A custom YOLOv8 model (95.7% precision, 91.6% recall, ~66 ms
            inference) trained on 2,800+ annotated instances. Upload a
            nadir-to-canopy orchard image and the model returns counts,
            bounding boxes, and an annotated preview.
          </p>
        </section>

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
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <CardTitle>No results yet</CardTitle>
              <CardDescription>
                Pick one or more images above to get started. The model works
                best on photos taken from below the tree looking straight up.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Tip: try multiple images at once to see batch detection in
              action.
            </CardContent>
          </Card>
        )}

        <div
          className={
            items.length > 1
              ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              : "flex flex-col gap-4"
          }
        >
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
