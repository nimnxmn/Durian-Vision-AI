# Phase 6 — A Complete Walkthrough

The "stretch" phase: tests on both sides of the wire, CI on every push, and an in-browser camera so the model can take its own photos. Read top to bottom.

---

## Part 1: What does "testing" actually buy you?

Up to Phase 5 the app works because *you ran it once and it didn't crash*. That's fine for an MVP. It stops being fine as soon as you start changing things — because the next change might silently break something three menus away that you don't think to retest. Tests are how you make that impossible.

We added two kinds of tests:

1. **Backend tests** with `pytest` — drive the FastAPI app through its real HTTP interface using `TestClient`. If `/api/detect` ever starts returning the wrong shape, the test catches it before deploy.
2. **Frontend tests** with `vitest` + `@testing-library/react` — render React components in a fake browser (`jsdom`) and assert on what the user would see. If the "Detect" button accidentally becomes always-disabled, the test catches it.

These are **unit / integration** tests, not end-to-end. We don't open a real browser, we don't actually run YOLO from the frontend tests. The point isn't to test *everything* — it's to test the **interfaces between parts**, because that's where regressions hide.

### CI ("continuous integration")

GitHub Actions runs three jobs on every push and every pull request:

1. **backend** — installs Python deps and runs `pytest`.
2. **frontend** — installs npm deps, runs `eslint`, `vitest`, then `next build`.
3. **docker** — only runs if the first two succeed. Builds the production image (without pushing) to make sure the Dockerfile still works.

If any job fails, the PR is marked red and merging is blocked (when you turn on branch protection). This is the safety net.

### Camera capture

The "stretch" item that turns the demo from "upload a file" into "point your phone at a tree." We use the browser's `MediaDevices.getUserMedia()` API to request the rear camera, render the live feed to a `<video>` element, and let the user grab a frame. The frame gets converted to a `File` and dropped into the existing detection pipeline — so the rest of the app doesn't change at all.

---

## Part 2: Why we structured it this way

### Why use FastAPI's `TestClient` instead of `requests` against a running server?

`TestClient` (built on `httpx`) calls FastAPI **directly in-process** — no real network, no real port. Two big wins:

- **Speed.** A roundtrip through `TestClient` is microseconds.
- **Deterministic.** No "did I remember to start the server?" CI flakiness.

It also fires the app's **lifespan**, which means our `warmup()` runs and `model_status()` reports `True` — so we can assert the real model is loaded, not a mock. That's why `test_health_ok` can assert `model_loaded is True`.

### Why a session-scoped client fixture

YOLO's warmup takes ~2–3 seconds. If we re-created the `TestClient` for every test, we'd pay that cost N times. The `scope="session"` fixture in `conftest.py` reuses one client across the whole test session. All 4 tests finish in 2.5 s total.

### Why test the *errors*, not just the happy path

Two negative tests (`test_detect_rejects_non_image`, `test_detect_rejects_bad_conf`) check that bad inputs get the right HTTP status code. The happy path is easy to keep working accidentally; the failure paths are the ones that drift silently when you refactor. Always have a test or two on the errors.

### Why vitest, not Jest

Both work. We picked vitest because:

- It's based on Vite, which understands ESM, TypeScript, and JSX with zero extra config.
- It speaks the same plugin system as the rest of the modern Vite ecosystem.
- It's faster than Jest in CI.

shadcn's primitives use Base UI, which uses modern JS features — vitest handles them out of the box; Jest needs a Babel/SWC config to compile.

### Why test components in isolation, not the page

We test `Controls` and `ResultCard` directly. We don't test `page.tsx`. Reason: `page.tsx` is mostly orchestration — it wires state to components. The components are the units of meaningful logic. Test the units, trust the wiring.

If we wanted end-to-end browser tests we'd reach for Playwright. For Phase 6 that's overkill.

### Why the camera capture stays a separate component

Three reasons:

1. **Lifecycle complexity.** The camera holds a hardware resource (a `MediaStream`). It needs to be stopped on unmount, on cancel, and after capture. That's enough cleanup to deserve its own file.
2. **Conditional rendering.** The camera UI has its own internal state (`active`, `error`) and renders three different shapes (idle button, live video + capture/cancel, error alert). Folding all that into `Controls` would muddy the form.
3. **Permission UX.** The first time the user clicks "Use camera," the browser pops a permission prompt. That's a unique interaction worth localizing in one place.

### Why we ask for `facingMode: "environment"`

`facingMode: "user"` is the front camera (selfie); `facingMode: "environment"` is the rear camera, which is what a phone user actually wants when pointed at a tree. We use `{ ideal: "environment" }` so on a laptop with only one webcam it falls back to whatever's available instead of erroring.

---

## Part 3: Walking through each file

### File 1: `apps/api/tests/conftest.py`

```python
@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c

@pytest.fixture(scope="session")
def demo_image_path() -> Path:
    root = Path(__file__).resolve().parents[3]
    return root / "demo-image" / "demo.jpg"
```

Two session-scoped fixtures. The `with TestClient(app) as c:` block is the magic that triggers the FastAPI lifespan — `warmup()` runs, the model loads, and only then do the tests start. When the session ends, the lifespan shutdown phase runs (in our case there's nothing to clean up, but the contract is correct).

`parents[3]` walks four levels up: `conftest.py` → `tests/` → `api/` → `apps/` → `DurianVisionAI/`. That's the repo root.

### File 2: `apps/api/tests/test_health.py`

```python
def test_health_ok(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["model_loaded"] is True
    assert "best.pt" in body["model_path"]
    assert body["error"] is None
```

`client` is injected by pytest from the fixture. We hit the endpoint, assert 200, and check the JSON shape. If `health.py` ever stops reporting `model_loaded` correctly, this fails.

### File 3: `apps/api/tests/test_detect.py`

Three tests:

- **`test_detect_demo_image`** — POSTs `demo-image/demo.jpg`, asserts the response shape (`count > 0`, detections list matches count, image returned, conf in `[0, 1]`).
- **`test_detect_rejects_non_image`** — POSTs `text/plain`, expects 415.
- **`test_detect_rejects_bad_conf`** — POSTs the image with `conf=1.5`, expects 422.

The `pytest.skip` guard on the demo image means the test suite won't crash if someone deletes the demo image — it skips with a clear message. That's friendlier than a hard fail when the absence is intentional (e.g. a fork that doesn't ship the image).

### File 4: `pyproject.toml`

```toml
[tool.pytest.ini_options]
testpaths = ["apps/api/tests"]
pythonpath = ["."]
filterwarnings = ["ignore::DeprecationWarning"]
```

- `testpaths` — where pytest looks for tests, so `python -m pytest` (no args) Just Works.
- `pythonpath = ["."]` — pytest adds the repo root to `sys.path`, so `from apps.api.main import app` resolves without an `__init__.py` in the repo root.
- The deprecation warning filter is for noisy upstream libs (PyTorch, ultralytics) — we silence them so test output stays clean.

### File 5: `requirements-dev.txt`

```
-r requirements.txt
pytest>=8
httpx>=0.27
```

`-r requirements.txt` re-includes the production deps. Then layers pytest and httpx (which `TestClient` uses under the hood) on top. CI installs from this file so the test-only deps don't bloat production.

### File 6: `apps/web/vitest.config.ts`

```ts
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"], css: false },
});
```

- `@vitejs/plugin-react` — lets vitest understand JSX.
- `alias: { "@": ... }` — same path alias as `tsconfig.json` so `import { Controls } from "@/components/controls"` works in tests too.
- `environment: "jsdom"` — fake browser DOM. Without it, `document`, `window`, etc. don't exist.
- `globals: true` — exposes `describe`/`it`/`expect` globally (you can still import them; both work).
- `css: false` — don't try to process Tailwind's `@import` directives during tests; styles aren't asserted on anyway.

### File 7: `apps/web/vitest.setup.ts`

One line: `import "@testing-library/jest-dom/vitest";`. This extends `expect` with matchers like `toBeInTheDocument`, `toBeDisabled`, `toHaveAttribute` — the matchers all the component tests use.

### File 8: `apps/web/__tests__/controls.test.tsx`

Five tests:

- "disables submit when no files are selected" — sanity check.
- "shows the singular label when one file is selected" — guards against accidentally writing `1 files`.
- "shows the batch label when multiple files are selected" — guards against losing the batch UX.
- "renders the current conf/iou values" — guards against the slider label drifting from `value.toFixed(2)`.
- "fires onSubmit when the button is clicked" — guards the wiring.

`makeProps` is a tiny factory so each test only spells out the props that matter. The defaults stay in one place.

`vi.fn()` is vitest's mock function — equivalent to `jest.fn()`. We pass it as the callback and assert how many times it was called.

### File 9: `apps/web/__tests__/result-card.test.tsx`

Three tests covering the three render branches: loading, done, error.

The fake base64 PNG is a real 1×1 transparent PNG. Tiny, valid, and lets us assert that the `<img src="data:image/png;base64,...">` renders correctly. The `download` attribute is checked against the expected sanitized filename (`detected-img.png`).

### File 10: `apps/web/components/camera-capture.tsx`

```tsx
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: "environment" } },
  audio: false,
});
streamRef.current = stream;
setActive(true);
requestAnimationFrame(() => {
  if (videoRef.current) {
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }
});
```

The two-step pattern (start the stream, then `requestAnimationFrame` to attach it) is because React hasn't yet rendered the `<video>` when `setActive(true)` queues. We wait one paint frame so `videoRef.current` is non-null.

`useRef` (not `useState`) for the stream because we don't want changes to trigger re-renders — the stream is *imperative* state.

```tsx
useEffect(() => {
  return () => stopStream();
}, []);
```

The cleanup function runs when the component unmounts. Without it, leaving the page while the camera is active would keep the camera light on (Mac/Windows) or the camera in-use (Linux) forever.

Capture path:

```tsx
const canvas = document.createElement("canvas");
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
const blob = await new Promise((resolve) =>
  canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
);
const file = new File([blob], `camera-${stamp}.jpg`, { type: "image/jpeg" });
onCapture(file);
```

We draw the current video frame onto an offscreen `<canvas>`, then ask the canvas for a JPEG blob. Wrapping `canvas.toBlob` (callback-based) in a Promise is the standard trick to use it with `async/await`. The resulting `File` looks exactly like what the file picker produces — so `onCapture(file)` slots right into the existing flow.

### File 11: `apps/web/components/controls.tsx` (one-line wiring)

```tsx
<CameraCapture onCapture={(file) => onFilesChange([...files, file])} />
```

We *append* the captured file to the existing files array instead of replacing it. That way you can mix uploaded and captured images in one batch.

### File 12: `.github/workflows/ci.yml`

Three jobs:

- **backend**: `setup-python`, install system libs for opencv, `pip install -r requirements-dev.txt`, `pytest -q`. The system libs are the same ones we apt-install in the Dockerfile — they're needed wherever `opencv-python-headless` runs.
- **frontend**: `setup-node`, `npm ci`, `npm run lint`, `npm test`, `npm run build`. Note `cache: npm` with `cache-dependency-path: apps/web/package-lock.json` so each run reuses the previous `node_modules` cache.
- **docker**: only runs if backend + frontend both pass (`needs: [backend, frontend]`). Builds the image to verify the Dockerfile, but doesn't push it. Uses GitHub Actions cache (`cache-from: type=gha`) so the second build is much faster.

`concurrency:` at the top cancels stale runs when you push twice in a row — saves CI minutes.

`workflow_dispatch:` lets you trigger the workflow manually from the Actions UI.

---

## Part 4: The full lifecycle

### Local development loop

```bash
# Run backend tests
python -m pytest apps/api/tests

# Run frontend tests
cd apps/web && npm test

# Run frontend tests in watch mode
cd apps/web && npm run test:watch
```

Both are fast (~2 s each). Re-run them every time you touch code in the area they cover.

### What happens on a `git push`

1. **GitHub receives the push.** Webhook fires.
2. **Actions queues three jobs.** Each gets a fresh Ubuntu VM.
3. **`backend` job runs**: clones the repo, sets up Python 3.11, installs deps, runs pytest. ~2 minutes.
4. **`frontend` job runs in parallel**: clones the repo, sets up Node 20, installs npm deps, lints, tests, builds. ~3 minutes.
5. If both pass, **`docker` job runs**: builds the image to make sure the Dockerfile still works. ~5 minutes (cached down to ~1 min on subsequent runs).
6. **Status badge** updates on the PR / branch. Green tick = safe to deploy.

### Camera lifecycle (in the browser)

1. User clicks **Use camera**. `start()` calls `navigator.mediaDevices.getUserMedia(...)`.
2. Browser pops the **permission prompt** (only the first time per origin). User clicks Allow.
3. The Promise resolves with a `MediaStream`. We save it in `streamRef`, flip `active` to true.
4. React renders the `<video>` element. We attach `srcObject = stream` on the next animation frame and call `.play()`.
5. The live preview appears.
6. User clicks **Capture frame**. We draw the current frame to a hidden canvas, blob it, wrap in `File`, call `onCapture(file)`.
7. `onCapture` (in `Controls`) appends the file to the parent's `files` state.
8. We immediately call `cancel()` — stops all tracks, clears the `srcObject`, sets `active` to false. Camera light off.
9. The new file appears in "files selected." User clicks **Detect**. Same flow as before.

If permission is denied or no camera exists, we render an `<Alert variant="destructive">` and don't change anything else.

---

## Part 5: What you now understand

- **Unit vs. integration vs. end-to-end** tests — we have the first two; Playwright would be the third.
- **FastAPI's `TestClient`** as an in-process driver, not a network client.
- **Fixtures and scoping** in pytest — `session` to amortize expensive setup.
- **vitest + jsdom + Testing Library** as the modern, Vite-native frontend test stack.
- **Path aliases must match between Vite, Vitest, and TypeScript** for `@/...` imports to work in tests.
- **GitHub Actions** — multi-job workflows, `needs:` for ordering, `concurrency:` for de-duping, `cache:` for speed.
- **`navigator.mediaDevices.getUserMedia`** — the modern (HTTPS-only, except localhost) camera API.
- **`useRef` for imperative resources** — streams, timers, raw DOM handles — that don't belong in React state.
- **`canvas.toBlob → File`** as the canonical way to turn an in-memory image into something upload-able.
- **Cleanup in `useEffect`** — without it, hardware resources leak when the component unmounts.

---

## Verified test results

- `python -m pytest apps/api/tests -q` — **4 passed in 2.46s** (1 health, 3 detect including 2 negative paths).
- `npm test` in `apps/web` — **8 passed in 1.15s** (5 Controls, 3 ResultCard).
- `npm run build` — clean, static export to `apps/web/out/`.
- CI workflow committed to `.github/workflows/ci.yml`; runs on push and PR.

End-to-end manual test (run yourself):

1. Run the tests:
   ```powershell
   python -m pytest apps/api/tests
   cd apps/web; npm test
   ```
2. Start the stack as in Phase 3+ and try the camera in your browser: click **Use camera**, allow permission, point at something, click **Capture frame**. Then click **Detect**.

## How to restart this phase

For local development, identical to previous phases. To run tests locally:

```powershell
# backend
python -m pytest apps/api/tests

# frontend
cd apps/web
npm test
```

To trigger CI: push to GitHub. The workflow runs automatically.

---

## Final project state

All six phases of the rebuild are done. You have:

- A production-quality FastAPI + Next.js + shadcn/ui app.
- Light/dark mode, batch upload, per-item status, downloadable annotated images, camera capture.
- A single-image Docker deploy that ships to Hugging Face Spaces.
- Unit tests on both sides of the wire and a CI workflow that runs them on every push.
- Five walkthrough docs (`phase-1` through `phase-5`) and this one — all written for a student who knew Python but had never touched the web.

If you want to keep going past Phase 6, candidate ideas: Playwright end-to-end smoke test that uploads the demo image and asserts the count; image-history persistence (IndexedDB on the client, or a tiny SQLite table on the server); a "share these detections" link via a signed URL.
