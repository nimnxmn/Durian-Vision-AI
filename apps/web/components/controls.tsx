"use client";

import { ChevronRight } from "lucide-react";

import { CameraCapture } from "@/components/camera-capture";
import { DropZone } from "@/components/drop-zone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type Props = {
  files: File[];
  conf: number;
  iou: number;
  loading: boolean;
  onFilesChange: (files: File[]) => void;
  onConfChange: (conf: number) => void;
  onIouChange: (iou: number) => void;
  onSubmit: () => void;
  onTryDemo: () => void;
};

export function Controls({
  files,
  conf,
  iou,
  loading,
  onFilesChange,
  onConfChange,
  onIouChange,
  onSubmit,
  onTryDemo,
}: Props) {
  return (
    <div className="mb-6 flex flex-col gap-5">
      <DropZone files={files} onFilesChange={onFilesChange} disabled={loading} />

      <div className="flex flex-wrap gap-2">
        <CameraCapture onCapture={(file) => onFilesChange([...files, file])} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTryDemo}
          disabled={loading}
        >
          Try demo image
        </Button>
      </div>

      <Button
        type="button"
        onClick={onSubmit}
        disabled={files.length === 0 || loading}
        className="w-fit"
      >
        {loading
          ? "Detecting..."
          : files.length > 1
          ? `Detect ${files.length} images`
          : "Detect durians"}
      </Button>

      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 select-none text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Advanced settings
        </summary>
        <div className="mt-4 flex flex-col gap-4 pl-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label>Min confidence</Label>
              <span className="font-mono text-sm text-muted-foreground">
                {conf.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[conf]}
              min={0.05}
              max={0.95}
              step={0.05}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v;
                if (typeof next === "number") onConfChange(next);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Higher = only high-certainty detections.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label>Overlap threshold (IoU)</Label>
              <span className="font-mono text-sm text-muted-foreground">
                {iou.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[iou]}
              min={0.1}
              max={0.9}
              step={0.05}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v;
                if (typeof next === "number") onIouChange(next);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Lower = tighter deduplication of overlapping boxes.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
