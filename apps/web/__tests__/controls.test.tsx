import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { Controls } from "@/components/controls";

function makeProps(overrides: Partial<Parameters<typeof Controls>[0]> = {}) {
  return {
    files: [],
    conf: 0.25,
    iou: 0.5,
    loading: false,
    onFilesChange: vi.fn(),
    onConfChange: vi.fn(),
    onIouChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}

describe("Controls", () => {
  it("disables submit when no files are selected", () => {
    render(<Controls {...makeProps()} />);
    const button = screen.getByRole("button", { name: /detect durians/i });
    expect(button).toBeDisabled();
  });

  it("shows the singular label when one file is selected", () => {
    const file = new File(["x"], "img.jpg", { type: "image/jpeg" });
    render(<Controls {...makeProps({ files: [file] })} />);
    expect(screen.getByText(/1 file selected/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /detect durians/i }),
    ).toBeEnabled();
  });

  it("shows the batch label when multiple files are selected", () => {
    const files = [
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
      new File(["y"], "b.jpg", { type: "image/jpeg" }),
      new File(["z"], "c.jpg", { type: "image/jpeg" }),
    ];
    render(<Controls {...makeProps({ files })} />);
    expect(screen.getByText(/3 files selected/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /detect 3 images/i }),
    ).toBeInTheDocument();
  });

  it("renders the current conf/iou values", () => {
    render(<Controls {...makeProps({ conf: 0.4, iou: 0.6 })} />);
    expect(screen.getByText("0.40")).toBeInTheDocument();
    expect(screen.getByText("0.60")).toBeInTheDocument();
  });

  it("fires onSubmit when the button is clicked", () => {
    const file = new File(["x"], "img.jpg", { type: "image/jpeg" });
    const onSubmit = vi.fn();
    render(<Controls {...makeProps({ files: [file], onSubmit })} />);
    fireEvent.click(screen.getByRole("button", { name: /detect durians/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
