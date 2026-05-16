# Phase 7 — Post-launch Polish (Bug Fix + Demo + Batch UX)

The image was built, the container ran, and… the annotated picture didn't show up. That's the first thing this phase fixes. Then we add two small features that turn the demo from "works" into "feels intentional": a one-click sample image and a proper batch-results layout. Read top to bottom.

---

## Part 1: What did we just build, and why?

Three changes, in order of importance:

1. **Bug fix — annotated image now displays.** A subtle "double prefix" bug made the browser silently reject the result image. Empty preview area, no console error. Classic.
2. **"Try demo image" button.** One click runs detection on a known-good photo (49 durians). Recruiters opening the live demo see results in 3 seconds instead of hunting for an orchard photo to upload.
3. **Batch summary + grid layout.** Uploading 5 images used to give 5 huge cards stacked vertically — you had to scroll forever. Now there's a summary strip at the top (total durians, average confidence, total inference time) and the cards flow into a responsive grid (1 / 2 / 3 columns by screen size).

Nothing in the model or API changed. This phase is 100% frontend.

---

## Part 2: Why we structured it this way

### Why the bug existed in the first place

A **data URL** is a way to embed binary data (like an image) directly inside text. Its shape is:

```
data:<mime-type>;base64,<the actual base64 bytes>
```

The browser uses the `data:image/png;base64,` prefix as the *type tag* — it tells the rendering engine "what follows is a PNG, decoded from base64." If the prefix is missing, the browser sees random characters and renders nothing. If the prefix appears **twice**, the browser also sees something it can't parse and renders nothing. Either way: silent failure.

Our backend (`apps/api/services/inference.py`) was returning the **full data URL** in `image_base64`:

```python
image_b64 = "data:image/png;base64," + base64.b64encode(png.tobytes()).decode("ascii")
```

But the frontend (`apps/web/components/result-card.tsx`) was treating the field as **raw base64** and prepending the prefix *again*:

```tsx
src={`data:image/png;base64,${result.image_base64}`}
```

So the `<img>` tag's `src` ended up looking like:

```
data:image/png;base64,data:image/png;base64,iVBORw0KGgoAAAA...
```

Garbage. No image rendered, no error logged. The kind of bug that's invisible until you actually look at the page.

### Why the fix is one-sided (frontend, not backend)

Either side could have been changed. We picked the frontend because:

- The backend's choice is more useful in the general case — `image_base64` is now directly usable anywhere a data URL is accepted (`<img src>`, `<a href download>`, CSS `url()`, etc.), no string concatenation needed at every call site.
- The field name `image_base64` is slightly misleading (it's really a data URL, not raw base64), but renaming it would be a breaking API change. We left it.
- One file edited, two lines changed.

**Lesson:** when two layers disagree on a format, fix the consumer, not the producer — fewer call sites usually means fewer surprises.

### Why a static `/demo.jpg` instead of a backend endpoint

We needed to give the user a way to run the model without uploading anything. Two designs:

| Approach | Pros | Cons |
|---|---|---|
| **Copy `demo-image/demo.jpg` → `apps/web/public/demo.jpg`** | Zero backend code. Image ships inside the static export. Browser caches it. | If we ever want *multiple* samples, this gets messy. |
| **New API endpoint `GET /api/samples/demo`** | Scales to many samples. Backend controls the source of truth. | More code. Need a route, a service, a test. |

For a portfolio demo with one sample image, the first option is right. The cost is ~50 KB added to the static export; the benefit is "click a button, see results."

The image is loaded with `fetch("/demo.jpg")` → `.blob()` → `new File([blob], ...)` — the same `File` object the file input would have produced. So the rest of the detection pipeline doesn't know or care that this is a "demo" run; it's just another image.

### Why a conditional grid layout

The previous layout was `flex flex-col gap-4` — a single vertical column for any number of results. That works for one image and falls apart at five.

The fix is a layout that **adapts to how many results there are**:

```tsx
items.length > 1
  ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
  : "flex flex-col gap-4"
```

- **1 result** → full-width card (it's the whole show, give it space).
- **2+ results** → grid: 1 column on phones, 2 on tablets, 3 on big screens.

Why conditional? Because forcing a grid for a single result would shrink that one card unnecessarily on large screens. The right layout depends on what you're showing.

### Why a batch summary strip

When you upload 8 images, the *interesting* number is "total durians counted across the orchard," not the count for image #5 specifically. The summary strip surfaces the batch-level numbers (`Images`, `Total durians`, `Avg confidence`, `Total inference`) at the top, so the at-a-glance answer is one look away.

It only renders when `items.length > 1` — for a single image, the card itself already shows all of this.

---

## Part 3: File-by-file walkthrough

### `apps/web/components/result-card.tsx` (bug fix)

Two `<img>`/`<a>` blocks changed. Before:

```tsx
src={`data:image/png;base64,${result.image_base64}`}
...
href={`data:image/png;base64,${result.image_base64}`}
```

After:

```tsx
src={result.image_base64}
...
href={result.image_base64}
```

`result.image_base64` is already a complete data URL (the backend prepends the prefix). We just pass it straight through. The download link works the same way — `href` accepts a data URL just fine, and the browser hands the bytes to the user's downloads folder when they click.

### `apps/web/public/demo.jpg` (new file)

A copy of `demo-image/demo.jpg`. Next.js serves anything in `public/` at the site root — so a file at `public/demo.jpg` is reachable at `https://yourapp.com/demo.jpg`. We use a relative path (`/demo.jpg`) so it works whether the app is running at `localhost:7860` or `huggingface.co/spaces/...`.

### `apps/web/components/controls.tsx` (new "Try demo" button)

Two changes:

1. **Props extended** — added `onTryDemo: () => void` to the `Props` type and the destructured arguments. This is how the parent component (`page.tsx`) passes the demo handler down.
2. **Button added** under the file picker:

```tsx
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
```

`variant="outline"` makes it visually secondary to the main "Detect durians" button — it's an alternative entry point, not the primary action. `disabled={loading}` prevents the user from double-firing a request while detection is in progress.

### `apps/web/app/page.tsx` (handler + summary + layout)

Three logical changes in one file.

**1. Refactored `runDetection` into a reusable `detectFiles(target: File[])`.**

The old version always read from `files` state. The new version takes the array as a parameter, so both the "Detect" button (which passes `files`) and "Try demo" (which passes a single demo file) can share the same logic.

```tsx
async function detectFiles(target: File[]) {
  if (target.length === 0) return;
  setLoading(true);
  const initial: Item[] = target.map((f, i) => ({ id: i, fileName: f.name, status: "loading" }));
  setItems(initial);
  await Promise.all(target.map(async (file, i) => { ... }));
  setLoading(false);
}

async function runDetection() {
  await detectFiles(files);
}
```

**2. New `tryDemo` handler.**

```tsx
async function tryDemo() {
  try {
    const res = await fetch("/demo.jpg");
    if (!res.ok) throw new Error(`Demo image not found (HTTP ${res.status})`);
    const blob = await res.blob();
    const demoFile = new File([blob], "demo_image.jpg", { type: "image/jpeg" });
    setFiles([demoFile]);
    await detectFiles([demoFile]);
  } catch (err) {
    setItems([{ id: 0, fileName: "demo_image.jpg", status: "error",
                error: err instanceof Error ? err.message : String(err) }]);
  }
}
```

Walk through it:

- `fetch("/demo.jpg")` — same fetch you'd use to hit any URL. Because the path is relative, the browser uses the page's own origin (`localhost:7860`, the HF Space URL, etc.).
- `.blob()` — turn the response body into a `Blob`, which is the browser's generic "chunk of binary data."
- `new File([blob], "demo_image.jpg", { type: "image/jpeg" })` — wrap the blob in a `File`. A `File` is just a `Blob` with a filename and MIME type. The rest of the app expects `File` objects (because that's what `<input type="file">` produces), so this makes the demo image indistinguishable from a real upload.
- `setFiles([demoFile])` — populate the file list, so the controls panel shows "1 file selected."
- `detectFiles([demoFile])` — run the same pipeline as a normal click.
- The `catch` only fires if `/demo.jpg` is missing or unreadable (e.g., if someone deletes the file from `public/`). It surfaces the error in the results area instead of failing silently.

**3. Batch summary computation.**

```tsx
const doneItems = items.filter((it) => it.status === "done" && it.result);
const totalCount = doneItems.reduce((sum, it) => sum + (it.result?.count ?? 0), 0);
const totalTimeMs = doneItems.reduce((sum, it) => sum + (it.result?.inference_ms ?? 0), 0);
const allDetections = doneItems.flatMap((it) => it.result?.detections ?? []);
const avgConf = allDetections.length > 0
  ? allDetections.reduce((s, d) => s + d.conf, 0) / allDetections.length
  : 0;
```

- `doneItems` — only count results that finished successfully. While images are still loading, we want stats that reflect what we *know*, not zeros that count the not-yet-done.
- `totalCount` — sum of `count` across all done results.
- `totalTimeMs` — sum of per-image `inference_ms`. Note: this is **CPU work time**, not wall-clock time. Because we `Promise.all` the requests, the wall-clock time is closer to `max(inference_ms)`, not the sum. We display the sum because it's the more meaningful "how much work did the model do" number.
- `allDetections` — flatten all per-image detection arrays into one big array, so we can compute a global average confidence.
- `avgConf` — guarded against divide-by-zero with `allDetections.length > 0`.

**4. Summary strip rendering.**

```tsx
{items.length > 1 && (
  <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
    ...
  </div>
)}
```

`grid-cols-2 sm:grid-cols-4` — on tiny screens the four stats stack 2×2; on anything `sm`+ they go in one row. `tabular-nums` on each number locks the digits to fixed widths so the values don't jiggle while images finish loading.

**5. Conditional grid for the results.**

```tsx
<div
  className={
    items.length > 1
      ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      : "flex flex-col gap-4"
  }
>
  {items.map((it) => <ResultCard ... />)}
</div>
```

Tailwind responsive prefixes: `md:` kicks in at ≥768 px, `xl:` at ≥1280 px. So:

- Phone: 1 column
- Tablet / small laptop: 2 columns
- Large desktop: 3 columns

---

## Part 4: The full request/data lifecycle (demo image path)

This is the path that didn't exist before this phase. Here's every step from clicking the button to seeing the annotated image:

1. **User clicks "Try demo image."** Browser fires the `onClick` handler bound to `tryDemo()`.
2. **`fetch("/demo.jpg")`** — browser issues a GET to `http://localhost:7860/demo.jpg`. Inside the container, FastAPI's static-file middleware (configured in `apps/api/main.py` to serve the Next.js export) finds `apps/web/out/demo.jpg` and returns its bytes with `Content-Type: image/jpeg`.
3. **`.blob()`** — the response body is buffered into a `Blob` in JS memory.
4. **`new File([blob], "demo_image.jpg", { type: "image/jpeg" })`** — wrap it so it matches the shape of an uploaded file.
5. **`setFiles([demoFile])` + `detectFiles([demoFile])`** — populate the file list and fire the detection pipeline. The status of the one result item is set to `"loading"` — the UI immediately shows a skeleton card.
6. **`detectImage(file, conf, iou)` (from `lib/api.ts`)** — builds a `FormData` (file + conf + iou) and POSTs to `/api/detect`.
7. **FastAPI receives the request** at `apps/api/routes/detect.py`, validates inputs, calls `services/inference.py::run_detection(bytes, conf, iou)`.
8. **Inference runs** — PIL opens the bytes → resize to 1280 px long edge → `model.predict()` → boxes extracted → `result.plot()` draws annotations → cv2 encodes PNG → base64 → prefix added → returned as a `DetectResponse`.
9. **Frontend receives the JSON.** `setItems(...)` updates the loading item to `status: "done"` with the response payload.
10. **React re-renders the `ResultCard`.** The `<img src={result.image_base64} />` now points to a valid data URL. The browser decodes the base64, paints the annotated PNG. **49 durians, drawn boxes, ~66 ms.**

Same lifecycle as a normal upload — the only difference is steps 1–4. Once we have a `File` object, the rest is shared.

---

## Part 5: What you now understand

After reading this walkthrough, you should be able to explain:

- **What a data URL is** and why a duplicated prefix breaks the browser silently.
- **Why `image_base64` is named misleadingly** but renaming it would be a breaking change.
- **How to ship a static asset with a Next.js app** by dropping it in `public/`.
- **How to turn a fetched image into a `File`** using `Blob` → `File`, so it can flow through code that expects an upload.
- **Why a conditional layout** beats a one-size-fits-all layout when the "size" you're rendering can vary by an order of magnitude.
- **Why `Promise.all` makes wall-clock time ≠ sum of inference times** for parallel requests.
- **Why we fix the consumer, not the producer**, when two layers disagree on a format.

---

## Test results

Manual smoke test, in this order:

1. `docker stop $(docker ps -q)` — kill the old container.
2. `docker build -t durianvision-ai .` — rebuild with the new code baked in.
3. `docker run --rm -p 7860:7860 durianvision-ai` — start fresh.
4. Open `http://localhost:7860`.
5. **Bug fix check:** upload one image, hit Detect. The annotated image should now appear (regression from the previous run, where the area was empty).
6. **Demo button:** click "Try demo image." Detection runs on `demo_image.jpg`, finds 49 durians.
7. **Batch layout:** select 3+ images, hit Detect. The summary strip appears above the cards; the cards lay out in 2 or 3 columns depending on window width.

If `npm test` in `apps/web/` fails on `__tests__/result-card.test.tsx`, it's because the old test asserted on the double-prefix shape. Update the expected `src` to `result.image_base64` directly — same fix as the component.

## How to restart / rerun this phase

```powershell
# Stop any running container
docker stop $(docker ps -q)

# Rebuild and run
docker build -t durianvision-ai .
docker run --rm -p 7860:7860 durianvision-ai
```

Then open `http://localhost:7860`. The demo button is the fastest way to verify everything works end-to-end.
