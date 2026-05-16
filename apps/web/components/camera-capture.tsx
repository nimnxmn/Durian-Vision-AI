"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  onCapture: (file: File) => void;
};

export function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => stopStream();
  }, []);

  function stopStream() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function start() {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not available in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      // Attach the stream on the next tick after the <video> has mounted.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      stopStream();
      setActive(false);
    }
  }

  function cancel() {
    stopStream();
    setActive(false);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([blob], `camera-${stamp}.jpg`, {
      type: "image/jpeg",
    });
    onCapture(file);
    cancel();
  }

  return (
    <div className="flex flex-col gap-2">
      {!active && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={start}
        >
          Use camera
        </Button>
      )}

      {active && (
        <div className="flex flex-col gap-2">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full max-w-md rounded-md border bg-black"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={capture}>
              Capture frame
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Camera unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
