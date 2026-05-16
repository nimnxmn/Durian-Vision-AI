# Phase 3 — A Complete Walkthrough

A student-friendly tour of the features we just added on top of the Phase 2 ugly MVP. Read top to bottom.

---

## Part 1: What did we just build?

In Phase 2 the app could do exactly one thing: upload one image, see one annotated result. That's enough to prove the pipeline works, but it's not enough to *show off*. Phase 3 adds the four things a recruiter would expect to see on a portfolio demo:

1. **Confidence and IoU sliders.** Both are knobs YOLO already accepts on every prediction. The backend was always reading them from the POST form. We just hadn't given the user a way to change them.
2. **Batch upload.** Pick a folder of images, get N annotated results in parallel.
3. **Download annotated PNG.** Right-click-save works, but a one-click download with a sensible filename feels much nicer.
4. **Detections table.** A collapsible table per image listing every bounding box (id, x, y, w, h, confidence). Useful for anyone who wants to inspect the raw model output.

The visual style is still plain. Phase 4 will swap in shadcn/ui for the polished look — today we're proving the *features*, not the *aesthetics*.

### Mental model: thresholds, briefly

Two numbers shape what YOLO returns:

- **Confidence threshold (`conf`)** — "minimum certainty to keep a box." Higher conf throws away wobbly detections. Lower conf keeps everything, including false positives. Default 0.25.
- **IoU threshold (`iou`)** — used during **Non-Maximum Suppression (NMS)**. When two boxes overlap by more than this fraction, YOLO assumes they're the same object and keeps only the more confident one. Lower IoU = aggressive deduplication; higher IoU = more permissive (you might see two boxes on one durian). Default 0.5.

By Phase 3 you have sliders for both. Drag them, click "Detect" again, see the count change.

---

## Part 2: Why we split the page into multiple files

Phase 2 deliberately kept everything in `app/page.tsx`. We promised we'd split it "when we have a concrete reason." Phase 3 hands us three reasons:

1. **`Controls`** — the sliders + file picker + button is a chunk of UI you can describe in one sentence ("the form on top of the page"). It owns no state of its own; it receives values and callbacks from the parent. That's a textbook **presentational component**: data in, events out.
2. **`ResultCard`** — one annotated image with download + detections table. It now appears N times (once per image in the batch). The moment you find yourself rendering "the same kind of thing, repeated," that thing is a component.
3. **`lib/api.ts`** — the fetch call and the TypeScript types are not really UI code. They're the contract between the frontend and the backend. Putting them in their own file means we can `import { detectImage }` from anywhere without polluting the page.

The new structure:

```
apps/web/
  app/
    page.tsx          # state + orchestration only
  components/
    controls.tsx      # form (file input + 2 sliders + submit)
    result-card.tsx   # one image's result + download + table
  lib/
    api.ts            # types + detectImage(file, conf, iou)
```

### Why these specific seams?

A common beginner mistake is to split files **by file type** — "all components here, all types there" — which looks tidy but doesn't help anyone find anything. The split that pays off is **by responsibility**, and the easiest way to find responsibilities is to ask: *"if I changed the shape of the backend response tomorrow, which files would I touch?"*

For us: `lib/api.ts` (the types and fetch). Nothing else. The components consume the types, but if `DetectResponse` gained a field, they wouldn't break.

Same question reversed: *"if I changed the visual look of the result card tomorrow?"* Only `components/result-card.tsx`. Not the page, not the API, not the controls.

When seams give you those kinds of clean blast radii, the split was worth it.

### "Props" — the language between components

When `Controls` doesn't own its own state, the parent (`page.tsx`) has to give it everything it needs to render and tell it how to report back. Those values and callbacks are called **props** ("properties"). Look at `controls.tsx`:

```ts
type Props = {
  files: File[];
  conf: number;
  iou: number;
  loading: boolean;
  onFilesChange: (files: File[]) => void;
  onConfChange: (conf: number) => void;
  onIouChange: (iou: number) => void;
  onSubmit: () => void;
};
```

Four values flow down (current state). Four callbacks flow up (what to do when the user does something). This is React's **uni-directional data flow** in miniature: data goes down, events go up.

You'll notice every callback is just a setter we already had in `page.tsx` — we hand `setConf` directly to `onConfChange`. That works because `setConf` already has the signature `(n: number) => void`. No wrapper function needed.

---

## Part 3: Walking through each file

### File 1: `apps/web/lib/api.ts` — the backend contract

```ts
export type Detection = { id: number; x: number; y: number; w: number; h: number; conf: number };

export type DetectResponse = {
  count: number;
  detections: Detection[];
  image_base64: string;
  inference_ms: number;
  image_size: [number, number];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function detectImage(
  file: File,
  conf: number,
  iou: number,
): Promise<DetectResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("conf", String(conf));
  form.append("iou", String(iou));

  const res = await fetch(`${API_URL}/api/detect`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as DetectResponse;
}
```

What changed from Phase 2:

- The types and the fetch logic moved out of `page.tsx` into this file. The code is the same as before; only the location changed.
- `detectImage` takes `conf` and `iou` as plain numbers and converts them to strings (FormData fields must be strings). Previously they were hard-coded to `"0.25"` and `"0.5"`.
- Throws on non-2xx responses, so callers can use try/catch normally.

`export` makes a symbol available to other files. Without `export`, the type or function is private to this module.

### File 2: `apps/web/components/controls.tsx` — the form

The component is one big return statement with three `<label>` blocks (file input, conf slider, iou slider) and a submit button. The interesting bits:

#### Multiple file selection

```tsx
<input
  type="file"
  accept="image/*"
  multiple
  onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
/>
```

`multiple` is the HTML attribute that lets the OS file picker accept Ctrl/Cmd-click selections. `e.target.files` is a `FileList` object — array-like but not actually an array — so we `Array.from(...)` to convert it. The `?? []` handles the rare case where `files` is null (input was cleared).

#### A range slider

```tsx
<input
  type="range"
  min={0.05}
  max={0.95}
  step={0.05}
  value={conf}
  onChange={(e) => onConfChange(Number(e.target.value))}
/>
```

`type="range"` renders a native browser slider. The value is always a *string* in `e.target.value`, even when min/max/step are numbers — HTML form inputs are strings under the hood. We `Number(...)` it to get a real float.

Above the slider we print `{conf.toFixed(2)}` so the user sees `0.25`, `0.30`, etc. update live as they drag.

#### Button text that adapts to the batch size

```tsx
{loading
  ? "Detecting..."
  : files.length > 1
  ? `Detect ${files.length} images`
  : "Detect durians"}
```

Three states: in progress, batch mode ("Detect 5 images"), single mode ("Detect durians"). A nested ternary like this is fine when each branch is one short expression. If it grew longer we'd extract it into a small `buttonLabel` variable.

### File 3: `apps/web/components/result-card.tsx` — one result

The interesting parts:

#### The download link

```tsx
<a
  href={`data:image/png;base64,${result.image_base64}`}
  download={downloadName}
  className="..."
>
  Download annotated PNG
</a>
```

Two HTML tricks make this work without any JavaScript:

- **`data:` URL** — the same trick we used in Phase 2 to display the image. A data URL embeds binary content directly in the URL itself. The browser doesn't need to fetch anything; it decodes the base64 and treats it as the file content.
- **`download` attribute** — when present on an `<a>` element, the browser saves the linked resource instead of navigating to it. The attribute's value becomes the suggested filename.

`downloadName` strips the original file's extension and adds `.png`:

```ts
const downloadName = `detected-${fileName.replace(/\.[^.]+$/, "")}.png`;
```

`/\.[^.]+$/` is a regex meaning "a dot, followed by one-or-more non-dot characters, anchored to the end." It matches the final extension. We replace it with the empty string, then re-append `.png`.

So `IMG_0042.jpg` becomes `detected-IMG_0042.png`.

#### The collapsible detections table

```tsx
<details>
  <summary>Show {result.detections.length} detections</summary>
  <div>...table...</div>
</details>
```

`<details>` and `<summary>` are built-in HTML elements that give you a collapsible block with **zero JavaScript and zero state**. The browser handles open/closed itself. The user clicks the summary; the rest expands. Perfect when you don't need to programmatically control the toggle.

Inside, a normal `<table>` with one row per detection. The columns are `id`, `x`, `y`, `w`, `h`, `conf` — the same six fields that came back from the API. `d.conf.toFixed(3)` formats confidences like `0.871`.

`key={d.id}` is the standard React requirement when rendering a list: each item must have a stable, unique identifier so React can match items between renders.

#### The status state machine

`ResultCard` accepts a `status: "loading" | "done" | "error"` prop and renders one of three things:

- **loading** → a gray pulsing placeholder `<div>`.
- **error** → the red error box (same style as Phase 2).
- **done** → the image, the download button, and the detections table.

The header line always shows the file name and a status-specific badge ("Detecting...", "49 durians · 65 ms · 1280×960", or "Error").

This three-way conditional rendering is a very common React pattern — there's nothing fancy here, but it's worth recognizing because you'll write it dozens of times in any real app.

### File 4: `apps/web/app/page.tsx` — the orchestrator

This file is now mostly state and side-effect plumbing. The JSX at the bottom is tiny:

```tsx
<Controls
  files={files}
  conf={conf}
  iou={iou}
  loading={loading}
  onFilesChange={setFiles}
  onConfChange={setConf}
  onIouChange={setIou}
  onSubmit={runDetection}
/>

{items.length > 1 && (
  <div>Total across batch: <strong>{totalCount}</strong> durians ...</div>
)}

<div>
  {items.map((it) => <ResultCard key={it.id} {...it} />)}
</div>
```

Three things to understand:

#### a. The `Item` type — modeling one row of work

```ts
type Item = {
  id: number;
  fileName: string;
  status: "loading" | "done" | "error";
  result?: DetectResponse;
  error?: string;
};
```

The `?` on `result` and `error` means "optional — might be undefined." A loading item has neither; a done item has `result`; a failed item has `error`. The status field tells the card which branch to render.

`id` is just the file's index in the original `files` array. We use it as the React `key` and to find the right item when an async fetch completes.

#### b. `runDetection` — fire-and-await per file

```ts
async function runDetection() {
  if (files.length === 0) return;
  setLoading(true);

  const initial: Item[] = files.map((f, i) => ({
    id: i, fileName: f.name, status: "loading",
  }));
  setItems(initial);

  await Promise.all(
    files.map(async (file, i) => {
      try {
        const result = await detectImage(file, conf, iou);
        setItems((prev) => prev.map((it) =>
          it.id === i ? { ...it, status: "done", result } : it
        ));
      } catch (err) {
        setItems((prev) => prev.map((it) =>
          it.id === i ? { ...it, status: "error", error: String(err) } : it
        ));
      }
    }),
  );

  setLoading(false);
}
```

The sequence:

1. Build the initial list with everyone in `"loading"`. Render shows N gray placeholders immediately.
2. For each file, fire an async fetch. We don't `await` each one sequentially — we collect all the promises and `await Promise.all` so they run in parallel.
3. As each fetch resolves (or rejects), we update *that one item* in the items array. We use the **functional form** of the setter — `setItems(prev => ...)` — because `setItems(items.map(...))` could miss updates if two completions land in the same tick. The functional form always sees the latest state.
4. The spread `...it` keeps existing fields; the new fields (`status`, `result`) overwrite.

This is the most subtle part of the file. The key idea: parallel async work updating shared state means you can't trust the closure-captured `items` — always use the functional setter.

#### c. The batch total

```ts
const totalCount = items.reduce(
  (sum, it) => sum + (it.result?.count ?? 0),
  0,
);
```

A reduce that sums up `result.count` across every item, treating missing results as zero. Then `{items.length > 1 && (<div>...{totalCount}...</div>)}` only renders the summary line when there's more than one image (no point showing "Total: 49" when there's only one card already showing "49 durians").

`?.` is the **optional chaining** operator: `it.result?.count` evaluates to `undefined` if `it.result` is `undefined`, instead of throwing. Combined with `?? 0` (the nullish coalescing) it gives us "this number, or zero if it's missing."

---

## Part 4: The full lifecycle

What happens, end to end, when you upload three images with `conf=0.30, iou=0.45`:

1. **Pick three files.** The `<input multiple>` reports back a `FileList` of length 3. We `Array.from` it to a `File[]` and store in `files` state. The button label updates to "Detect 3 images."
2. **Drag `conf` to 0.30.** `onChange` fires, `setConf(0.30)` runs, React re-renders. The label above the slider updates from "0.25" to "0.30". No network traffic yet.
3. **Drag `iou` to 0.45.** Same thing.
4. **Click "Detect 3 images".** `runDetection` runs:
   - `setLoading(true)` and `setItems([...3 loading items...])` flush together on the next render. The page now shows three gray placeholders.
   - We kick off three `detectImage(...)` calls in parallel. The browser opens (up to) three concurrent HTTP connections to `127.0.0.1:8000`.
   - For each request: FastAPI receives the multipart upload, runs YOLO with the conf/iou we passed, returns JSON.
   - As each response arrives, we update that item's status to `"done"` with its result. React re-renders just that card.
5. **All three finish.** `Promise.all` resolves, `setLoading(false)` runs, the button re-enables, the "Total across batch" line appears. The three cards now show their images, download buttons, and collapsible tables.
6. **Click "Download annotated PNG" on card 2.** The `<a download="...">` fires. Because the `href` is a `data:` URL, the browser writes the embedded bytes to your Downloads folder under the suggested filename. No fetch, no server round trip — the bytes were already in your tab's memory.
7. **Click "Show 24 detections".** The `<details>` element toggles open. The table renders 24 rows. No state change, no JS — pure HTML.

If one of the three fetches fails (say image 2 is too large), only that card flips to the error state. The other two still show their results. This is why we maintain a per-item status instead of one global `error`.

---

## Part 5: What you now understand

After reading this you should be able to explain:

- **When to split a component out.** Repetition (`ResultCard` × N) and clear blast-radius seams (`lib/api.ts` for the backend contract).
- **Props.** Values down, callbacks up. The data flow is uni-directional.
- **`<input type="range">`** and why values always come back as strings.
- **`<input type="file" multiple>`** and the `FileList`/`File[]` conversion.
- **The `download` attribute** combined with `data:` URLs for client-side file downloads.
- **`<details>` and `<summary>`** for zero-JS collapsible sections.
- **Parallel async work with `Promise.all`** while safely updating React state via the functional setter (`setItems(prev => ...)`).
- **Optional chaining (`?.`) and nullish coalescing (`??`)** for safely walking through "might be missing" data.
- **A per-item status field** so partial failures don't blow up the whole batch.

---

## Verified test results

- `npm run build` in `apps/web` — **compiled successfully**, TypeScript clean, route `/` statically prerendered.

End-to-end manual test (run yourself):

1. Backend:
   ```powershell
   python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
   ```
2. Frontend:
   ```powershell
   cd apps/web
   npm run dev
   ```
3. Open http://localhost:3000.
4. Pick several files from `sample_images/` or `duriantest/`.
5. Adjust the sliders, click **Detect N images**, watch the placeholder cards fill in one by one.
6. Click **Download annotated PNG** on any result — you should get `detected-<original-name>.png`.
7. Click **Show N detections** — the per-box table should expand.

## How to restart this phase

Identical to Phase 2 — two terminals, two servers:

```powershell
python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
cd apps/web
npm run dev
```

Hot reload works for both. Edit `apps/web/components/controls.tsx` and the slider updates instantly. Edit `apps/api/services/inference.py` and uvicorn restarts itself.

---

**Up next — Phase 4:** visual redesign with shadcn/ui (proper buttons, cards, sliders, dark mode), better typography, and the empty-state / loading-state illustrations a portfolio demo deserves.
