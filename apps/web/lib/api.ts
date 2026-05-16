export type Detection = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
};

export type DetectResponse = {
  count: number;
  detections: Detection[];
  image_base64: string;
  inference_ms: number;
  image_size: [number, number];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function detectImage(
  file: File,
  conf: number,
  iou: number,
): Promise<DetectResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("conf", String(conf));
  form.append("iou", String(iou));

  const res = await fetch(`${API_URL}/api/detect`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as DetectResponse;
}
