# Phase 2 — A Complete Walkthrough

A student-friendly tour of the Next.js frontend we just built. This is the "ugly MVP" — it does the job, looks plain, and proves the full pipeline works end-to-end. Read top to bottom.

---

## Part 1: What is a "frontend" actually?

In Phase 1 we built a backend — a Python program that sits on port 8000 and answers requests. But a backend on its own is invisible: only a developer with `curl` or Swagger can use it. A **frontend** is the website that a real human opens in a browser. Its only job is to:

1. Show controls (a file picker, a button).
2. Collect input from the user.
3. Send that input to the backend.
4. Show the result the backend sends back.

That's literally it. The frontend has no idea how YOLO works. It doesn't know what a durian is. It just knows: *"there is a server at `http://127.0.0.1:8000/api/detect` that accepts an image and returns JSON; my job is to talk to it."*

### Why Next.js? Why not just one HTML file?

You *could* write this as a single `index.html` with a `<script>` tag. For a one-page demo it would even be shorter. We use Next.js because:

- **TypeScript** catches dumb bugs before they reach the browser. Type a `Detction` instead of `Detection` and the editor underlines it red. Plain HTML has no such safety.
- **React** lets us describe the UI as a function of state (`file`, `result`, `loading`, `error`) instead of poking at the DOM by hand. When `loading` flips to `true`, the button text changes automatically. We never write `document.getElementById(...)`.
- **Tailwind CSS** gives us utility classes like `p-8`, `text-sm`, `border` so we never write a `.css` file. Styling lives next to the markup that uses it.
- **The App Router** gives us a folder layout that mirrors URLs. `app/page.tsx` is the homepage. `app/about/page.tsx` would be `/about`. No routing config to wire up.
- **Static export later.** In Phase 5 we'll tell Next.js to compile this whole app down to plain HTML/JS files, and FastAPI will serve them. So the production deployment is still just one Python container — we don't run two servers.

### What's the architecture in one picture?

```
[ Browser at localhost:3000 ]                 [ FastAPI at localhost:8000 ]
            │                                              │
            │  user picks image, clicks button             │
            │                                              │
            │ ─── POST /api/detect (multipart) ──────────▶ │
            │                                              │ runs YOLO
            │ ◀────── JSON { count, image_base64, ... } ── │
            │                                              │
        render annotated preview
```

Two separate servers talk over HTTP. The browser doesn't care that one is Python and the other is Node — it just sees URLs.

### Wait, why two servers in dev but one in prod?

In development we want **hot reload**. Edit `page.tsx`, save, the browser updates instantly. Next.js's dev server (`npm run dev`) does this. FastAPI's `--reload` flag does the same for Python. Two processes, two ports, but each gives instant feedback for the language it owns.

In production we don't need hot reload. We pre-compile the frontend to static files and let FastAPI serve them. One process, one port. We get to that in Phase 5.

---

## Part 2: Why we structured it this way

### One page, one file

Phase 2 is called an "ugly MVP" on purpose. The goal is: prove the full pipeline (file picker → upload → API call → annotated image displayed) works end-to-end before we spend any time on polish. So the whole UI is in **one component file**: `app/page.tsx`. No reusable components, no custom hooks, no state library. Just one function that returns JSX.

This is deliberate. Premature abstraction is the #1 way to slow down a solo project. We will split this file when we have a *concrete reason* to — for example, in Phase 3 when we add a sliders panel that becomes its own component, or batch upload that needs its own page. Today there's nothing to split.

### Why a client component?

React (and Next.js) lets a component run in two places: **on the server** (renders HTML once, sends it down) or **on the client** (runs in the browser, can use `useState`, `onClick`, etc.). The first line of `page.tsx` is `"use client";`. That's the opt-in: this page needs to react to user input, manage local state, and call `fetch()`, all of which happen in the browser.

If we omitted `"use client"`, Next.js would try to render it on the server and complain that we used `useState`. The fix is the directive at the top.

### Why the API URL lives in an env var

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
```

Today the backend is on `127.0.0.1:8000`. In production (Hugging Face Spaces, Phase 5) it'll be `/api` on the same origin — no host, no port. We don't want to hard-code that. By reading `NEXT_PUBLIC_API_URL` at build time, we can change the deploy target by setting an environment variable, not editing the source.

The `NEXT_PUBLIC_` prefix is a Next.js convention: only env vars with that prefix get bundled into the browser code. Without it, the variable would be `undefined` once shipped to the browser (which is a safety feature so you don't leak `DATABASE_PASSWORD` to users).

### Why TypeScript mirrors the Pydantic schemas

`apps/api/schemas.py` defines `Detection` and `DetectResponse` in Python. We re-declare them as TypeScript `type` aliases at the top of `page.tsx`. Why duplicate?

Because the wire format is JSON, and TypeScript has no way to *see* Python types. We have to tell it. The TS types are a **promise to the compiler** that the JSON coming back will have those shapes. If the backend changes the shape (say, renames `count` to `total`), the frontend will keep compiling but break at runtime. In a bigger project we'd auto-generate TS types from FastAPI's OpenAPI schema; for an MVP, hand-writing them is faster.

---

## Part 3: Walking through each file

### File 1: `apps/web/package.json` — the dependency list

You don't write this by hand; `create-next-app` did. The interesting lines:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

`npm run dev` is the only one you'll run during this phase. It starts a hot-reloading dev server on port 3000.

Dependencies:
- `next` is the framework.
- `react` and `react-dom` are React itself — Next.js is built on top.
- `tailwindcss` and `@tailwindcss/postcss` give us utility-class styling.
- `typescript`, `@types/*`, `eslint` are development-time tools (they don't ship to users).

### File 2: `apps/web/app/layout.tsx` — the shell every page lives in

```tsx
export const metadata: Metadata = {
  title: "DurianVision AI",
  description: "Automated durian detection and counting from orchard images.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

Every page in the app is rendered *inside* this layout. The layout owns the `<html>` and `<body>` tags. We changed:

- `metadata.title` — what appears in the browser tab.
- `metadata.description` — what shows up in link previews and search engines.

`{children}` is where the page-specific content (our `page.tsx`) gets injected. The Geist fonts are loaded by Next.js's font system, which downloads them at build time and inlines them so there's no flash of unstyled text.

### File 3: `apps/web/app/page.tsx` — the entire app

This is the file you'll actually edit. Let's walk through it section by section.

#### 3a. The `"use client";` directive

```ts
"use client";
```

Tells Next.js: render this in the browser, not on the server. Required because we use `useState` and event handlers.

#### 3b. The environment-driven API URL

```ts
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
```

`??` is the **nullish coalescing operator** — read it as "or, if the left side is null/undefined." So: if `NEXT_PUBLIC_API_URL` is set, use it; otherwise fall back to the local dev backend.

#### 3c. The TypeScript types

```ts
type Detection = { id: number; x: number; y: number; w: number; h: number; conf: number };

type DetectResponse = {
  count: number;
  detections: Detection[];
  image_base64: string;
  inference_ms: number;
  image_size: [number, number];
};
```

A line-for-line mirror of `apps/api/schemas.py`. The `[number, number]` is a **tuple type** — exactly two numbers, in that order — matching Python's `tuple[int, int]`.

#### 3d. The state

```ts
const [file, setFile] = useState<File | null>(null);
const [result, setResult] = useState<DetectResponse | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

`useState` is React's most important function. Each call returns two things: the current value, and a setter that schedules a re-render with the new value.

Four pieces of state:
- `file` — the image the user selected (or null before they pick one).
- `result` — the JSON we got back from `/api/detect` (or null before we've called it).
- `loading` — true while a request is in flight, so the button can disable itself.
- `error` — the error message to show, if any.

You'll notice we never call `document.getElementById` or `element.innerText = ...`. We change state; React re-renders the JSX with the new state baked in. That's the entire mental model.

#### 3e. The submit handler

```ts
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!file) return;
  setLoading(true);
  setError(null);
  setResult(null);

  const form = new FormData();
  form.append("file", file);
  form.append("conf", "0.25");
  form.append("iou", "0.5");

  try {
    const res = await fetch(`${API_URL}/api/detect`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    const data: DetectResponse = await res.json();
    setResult(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(false);
  }
}
```

Line by line:

- `e.preventDefault()` — by default an HTML `<form>` does a full-page navigation on submit. We don't want that; we want a fetch. This stops the default.
- `if (!file) return;` — guard. The button is also `disabled` when there's no file, but we double-check here.
- `setLoading(true); setError(null); setResult(null);` — flip into "in progress" state and clear the last attempt.
- `new FormData()` is the browser API for building multipart/form-data — the same encoding `curl -F` produces. We append three fields: the image file and the two YOLO knobs.
- `fetch(...)` — the browser's HTTP client. We `await` the response, then `await res.json()` to parse the body. Two awaits because (1) the response headers may arrive before the body, and (2) parsing the body is itself async.
- `if (!res.ok)` — `fetch` does NOT throw on 4xx/5xx. We have to check `res.ok` (true for status 200–299) and throw ourselves if we want try/catch to catch HTTP errors.
- `try/catch/finally` — `finally` always runs, so `setLoading(false)` always fires, even if the request failed. Without that, the button would be stuck on "Detecting..." forever after an error.

#### 3f. The JSX (what the user sees)

```tsx
<main className="mx-auto max-w-3xl p-8 font-sans">
  <h1>DurianVision AI</h1>
  <p>Upload a nadir-to-canopy orchard image. ...</p>

  <form onSubmit={onSubmit}>
    <input type="file" accept="image/*" onChange={...} />
    <button type="submit" disabled={!file || loading}>
      {loading ? "Detecting..." : "Detect durians"}
    </button>
  </form>

  {error && <pre>{error}</pre>}

  {result && (
    <section>
      <div><strong>{result.count}</strong> durians detected ...</div>
      <img src={`data:image/png;base64,${result.image_base64}`} ... />
    </section>
  )}
</main>
```

Three blocks: the form, the error (only if there is one), and the result (only if there is one). The pattern `{condition && <jsx />}` is React's idiom for "show this only when truthy" — when `error` is null, the entire `<pre>` block is skipped.

The `<img src="data:image/png;base64,...">` trick is how we display a binary image that came back as a base64 string inside JSON. The browser decodes the base64 and renders it as if it were a file on disk. This is convenient for an MVP because we don't need a separate URL for the annotated image. (In Phase 3 or 5 we might switch to returning a blob URL for larger images.)

`accept="image/*"` makes the OS file picker show only image files. It's a hint, not a security check — the backend still validates content type.

### File 4: `apps/web/app/globals.css` — base styles

Unchanged from the scaffold. It imports Tailwind and sets a few CSS variables for fonts and colors. We don't touch it in Phase 2.

### File 5: `apps/web/next.config.ts`, `tsconfig.json`, `postcss.config.mjs`

Configuration scaffolded by `create-next-app`. Leave them alone in Phase 2. They wire up TypeScript, PostCSS (for Tailwind), and Next.js itself.

---

## Part 4: The full request/data lifecycle

Step by step, what happens when you drop an image on the page and click the button:

1. **You select a file.** The `<input type="file">` fires its `onChange` event with `e.target.files`. We grab the first file and store it in React state via `setFile(...)`. React re-renders; the button is no longer `disabled` because `!file` is now false.

2. **You click "Detect durians".** The button's type is `submit`, so the surrounding `<form>` fires its `onSubmit` event. Our `onSubmit` runs.

3. **`onSubmit` builds a `FormData`** with three fields: `file` (the image bytes), `conf=0.25`, `iou=0.5`. It calls `fetch("http://127.0.0.1:8000/api/detect", { method: "POST", body: form })`. The browser:
   - Serializes the FormData as `multipart/form-data` (the same format curl produces with `-F`).
   - Opens a TCP connection to 127.0.0.1:8000.
   - Sends the POST request with appropriate headers.

4. **CORS preflight (maybe).** Because we're calling from `localhost:3000` to `127.0.0.1:8000` — different origin — the browser may first send an `OPTIONS` preflight request to ask the server "are you OK with this?" FastAPI's `CORSMiddleware` (configured in Phase 1 to allow `http://localhost:3000`) responds yes. Then the actual POST goes through.

5. **FastAPI processes the request.** Phase 1's pipeline kicks in: `routes/detect.py` validates the upload, `services/inference.py` runs YOLO, draws boxes, base64-encodes the annotated PNG, and returns a `DetectResponse` JSON.

6. **`fetch` resolves.** Our `await res.json()` parses the JSON body. We store it in `result` via `setResult(...)` and set `loading` back to false in the `finally` block. React re-renders.

7. **The result section appears.** Because `result` is now truthy, the `{result && <section>...</section>}` block renders. The count and inference time appear. The `<img src="data:image/png;base64,...">` causes the browser to decode the base64 string and paint the annotated image.

8. **You see the result.** End to end this takes ~100ms for inference plus whatever the upload took. The bottleneck for large images is the upload, not the model.

If anything fails — bad file type, server down, model error — `fetch` either rejects or returns a non-2xx response, we throw, `catch` writes the message into `error`, the red `<pre>` block renders.

---

## Part 5: What you now understand

After reading this you should be able to explain:

- **What a frontend is** and why it's a separate program from the backend.
- **Why we picked Next.js** instead of a single HTML file (TypeScript safety, hot reload, static export later).
- **Server components vs. client components** — and why this page needs `"use client";`.
- **React state** — four `useState` hooks, what each represents, and why we never touch the DOM directly.
- **The `fetch` API** — how to POST `FormData`, why `res.ok` exists, why we need try/catch/finally.
- **CORS** — why two servers on different ports need a CORS middleware to talk.
- **The base64 data URL trick** for embedding images in JSON responses.
- **Conditional rendering** — the `{x && <jsx />}` pattern.
- **Tailwind utility classes** — styling without ever opening a `.css` file.

You've now built a working two-tier app. The rest is polish.

---

## Verified test results

- Scaffold: `npx create-next-app@latest apps/web ...` — succeeded.
- Production build: `npm run build` in `apps/web` — **compiled successfully**, TypeScript checks passed, both routes (`/` and `/_not-found`) statically prerendered.

End-to-end manual test (run yourself):

1. Start the backend (in repo root):
   ```bash
   python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
   ```
2. Start the frontend (in another terminal):
   ```bash
   cd apps/web
   npm run dev
   ```
3. Open http://localhost:3000, pick `demo-image/demo.jpg`, click **Detect durians**. You should see "49 durians detected" and the annotated preview.

## How to restart this phase

```bash
# Backend (terminal 1)
python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000

# Frontend (terminal 2)
cd apps/web
npm run dev
```

Edit `apps/web/app/page.tsx` and the browser will hot-reload on save.

---

**Up next — Phase 3:** sliders for `conf` and `iou`, batch upload, a download button for the annotated image, and a small detections table.
