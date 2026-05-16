"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DetectResponse } from "@/lib/api";

type Props = {
  fileName: string;
  status: "loading" | "done" | "error";
  result?: DetectResponse;
  error?: string;
};

export function ResultCard({ fileName, status, result, error }: Props) {
  const downloadName = `detected-${fileName.replace(/\.[^.]+$/, "")}.png`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-all">{fileName}</CardTitle>
        <CardDescription>
          {status === "loading" && "Detecting..."}
          {status === "done" && result && (
            <>
              <span className="font-medium text-foreground">
                {result.count} durians
              </span>{" "}
              · {result.inference_ms.toFixed(1)} ms ·{" "}
              {result.image_size[0]}×{result.image_size[1]}
            </>
          )}
          {status === "error" && (
            <span className="text-destructive">Failed</span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {status === "loading" && <Skeleton className="h-48 w-full" />}

        {status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Detection failed</AlertTitle>
            <AlertDescription>
              <pre className="whitespace-pre-wrap text-xs">{error}</pre>
            </AlertDescription>
          </Alert>
        )}

        {status === "done" && result && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.image_base64}
              alt={`Detections for ${fileName}`}
              className="max-w-full rounded-md border"
            />
            <div className="flex gap-2">
              <a
                href={result.image_base64}
                download={downloadName}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Download annotated PNG
              </a>
            </div>
            {result.detections.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show {result.detections.length} detection
                  {result.detections.length === 1 ? "" : "s"}
                </summary>
                <div className="mt-3 overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">#</th>
                        <th className="px-2 py-1.5 text-left font-medium">x</th>
                        <th className="px-2 py-1.5 text-left font-medium">y</th>
                        <th className="px-2 py-1.5 text-left font-medium">w</th>
                        <th className="px-2 py-1.5 text-left font-medium">h</th>
                        <th className="px-2 py-1.5 text-left font-medium">
                          conf
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.detections.map((d) => (
                        <tr
                          key={d.id}
                          className="border-t border-border/50 font-mono"
                        >
                          <td className="px-2 py-1">{d.id}</td>
                          <td className="px-2 py-1">{d.x}</td>
                          <td className="px-2 py-1">{d.y}</td>
                          <td className="px-2 py-1">{d.w}</td>
                          <td className="px-2 py-1">{d.h}</td>
                          <td className="px-2 py-1">
                            {d.conf.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
