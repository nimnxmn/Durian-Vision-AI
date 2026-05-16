"use client";

import { CameraCapture } from "@/components/camera-capture";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Detection settings</CardTitle>
        <CardDescription>
          Pick one or more orchard images, tune the thresholds, then run the
          model.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="files">Image(s)</Label>
          <input
            id="files"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) =>
              onFilesChange(Array.from(e.target.files ?? []))
            }
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-foreground hover:file:bg-muted/70"
          />
          {files.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"} selected
            </p>
          )}
          <CameraCapture
            onCapture={(file) => onFilesChange([...files, file])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTryDemo}
            disabled={loading}
            className="w-fit"
          >
            Try demo image
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label>Confidence threshold</Label>
            <span className="text-sm font-mono text-muted-foreground">
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
            Higher = fewer, more certain detections.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label>IoU (NMS) threshold</Label>
            <span className="text-sm font-mono text-muted-foreground">
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
            Lower = stricter overlap removal between boxes.
          </p>
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
      </CardContent>
    </Card>
  );
}
