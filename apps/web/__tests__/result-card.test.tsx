import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ResultCard } from "@/components/result-card";
import type { DetectResponse } from "@/lib/api";

const FAKE_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wm6Q5UAAAAASUVORK5CYII=";

const fakeResult: DetectResponse = {
  count: 2,
  detections: [
    { id: 0, x: 10, y: 20, w: 30, h: 40, conf: 0.91 },
    { id: 1, x: 50, y: 60, w: 70, h: 80, conf: 0.55 },
  ],
  image_base64: FAKE_PNG_B64,
  inference_ms: 64.2,
  image_size: [1280, 960],
};

describe("ResultCard", () => {
  it("renders a skeleton while loading", () => {
    const { container } = render(
      <ResultCard fileName="img.jpg" status="loading" />,
    );
    expect(screen.getByText("img.jpg")).toBeInTheDocument();
    expect(screen.getByText(/detecting/i)).toBeInTheDocument();
    expect(container.querySelector("[data-slot=skeleton]")).toBeTruthy();
  });

  it("renders the count, image, and download link when done", () => {
    render(
      <ResultCard fileName="img.jpg" status="done" result={fakeResult} />,
    );
    expect(screen.getByText(/2 durians/i)).toBeInTheDocument();
    const img = screen.getByAltText(/Detections for img\.jpg/i);
    expect(img).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Download annotated PNG/i });
    expect(link).toHaveAttribute("download", "detected-img.png");
  });

  it("renders the error alert when status is error", () => {
    render(
      <ResultCard
        fileName="bad.jpg"
        status="error"
        error="API 415: unsupported"
      />,
    );
    expect(screen.getByText(/detection failed/i)).toBeInTheDocument();
    expect(screen.getByText(/API 415: unsupported/)).toBeInTheDocument();
  });
});
