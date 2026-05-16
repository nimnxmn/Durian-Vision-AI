# Phase 4 — A Complete Walkthrough

A student-friendly tour of the visual redesign. The features didn't change; the UI did. Read top to bottom.

---

## Part 1: What is a "design system" and why does our project need one?

Phase 2's MVP and Phase 3's batch features both work — but the page looks like a 2003 form. Native buttons, native sliders, native file pickers. Native widgets are *fine* if your goal is "prove the pipeline works." They're not fine for a portfolio piece you want a recruiter to take seriously.

A **design system** is a small library of pre-styled, pre-tested UI primitives that look good together: `Button`, `Slider`, `Card`, `Alert`, etc. Instead of styling everything ad-hoc with Tailwind, you import the primitive and get a consistent feel for free. The primitives also handle the *boring* parts of UI for you — focus rings, keyboard navigation, ARIA roles, hover states — which is the stuff most beginners forget.

We picked **shadcn/ui**, which is different from most UI libraries. shadcn is a **copy-paste registry**, not an npm package you import from. When you run `npx shadcn add button`, it writes a `components/ui/button.tsx` file into your repo. The code is *yours*. You can read it, edit it, theme it however you want. No version pinning, no breaking upstream changes.

Underneath, shadcn's primitives are built on **Base UI** (formerly Radix), which provides the unstyled, accessible behavior. shadcn just applies its Tailwind styling on top.

### What else did Phase 4 add?

- **Dark mode**, via the `next-themes` package — toggles a `class="dark"` on `<html>` and our CSS variables flip.
- **A header** with the project name and the theme toggle.
- **A hero section** with proper typography and a one-liner about the model.
- **An empty-state card** when no detections have been run yet.
- **A footer.**
- **Proper card layout** for the controls and each result, using shadcn's `Card`/`CardHeader`/`CardContent`.

---

## Part 2: Why we structured it this way

### shadcn over off-the-shelf UI kits

The two real alternatives were Material UI (MUI) and Chakra UI. Both ship as runtime libraries — you `npm install` them and import components. Three reasons we picked shadcn:

1. **The code lives in your repo.** When you want a slightly different look, you edit `components/ui/slider.tsx` directly. No "override" props, no theme escape hatches, no fighting the library.
2. **Smaller bundle.** shadcn ships only what you `add`. MUI bundles a lot by default.
3. **Tailwind-native.** Our whole project already uses Tailwind utility classes. shadcn's components are built the same way. Nothing to bridge.

### Why next-themes for dark mode

`next-themes` is a tiny library that does three things well:
- Reads system preference (`prefers-color-scheme`).
- Persists the user's choice to `localStorage`.
- Adds/removes a `class="dark"` on `<html>` without flicker.

Tailwind v4 plus shadcn's CSS variables (`oklch(...)`) already do the rest: every color we use is wired to a CSS variable that has a light value in `:root` and a dark value in `.dark`. Flip the class and the entire palette switches.

### Why a separate `ThemeProvider` component file

`next-themes` exports `ThemeProvider`, but using it requires the `"use client"` directive (it manages browser state). Our `app/layout.tsx` is a **server component** by default — and we want it to stay that way so Next.js can pre-render the layout. The standard pattern is to write a tiny client-component wrapper (`components/theme-provider.tsx`) and import it into the server layout. The server layout itself stays "server."

This is the most subtle thing in Phase 4: a server component can import a client component, but not the other way around. The wrapper trick is how libraries that need to run in the browser get *into* a server layout.

### Why `suppressHydrationWarning` on `<html>`

When `next-themes` initializes, it runs a tiny inline script *before* React hydrates, which immediately sets the right `class` on `<html>` to avoid a flash of the wrong theme. That means the server-rendered HTML and the post-script HTML differ for one render. React would normally yell about that. `suppressHydrationWarning` on the `<html>` element silences the warning *only* for that one element, which is exactly the right scope.

---

## Part 3: Walking through each file

### File 1: `apps/web/components.json` — the shadcn config

Written by `npx shadcn init`. Tells the CLI where to put new components, which Tailwind config you have, which color palette, etc. You won't usually edit it. When you run `npx shadcn add card`, the CLI reads this file to know where to drop `card.tsx`.

### File 2: `apps/web/app/globals.css`

shadcn rewrote this. The notable additions:

- `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` — extra utility classes the primitives use.
- A long `@theme inline { ... }` block that maps CSS variables (`--color-primary`, `--color-card`, etc.) so Tailwind's `bg-primary`, `text-card-foreground` etc. resolve correctly.
- `:root { ... }` with the **light** palette (using `oklch()` color values for perceptual uniformity — `oklch(1 0 0)` is white, `oklch(0.145 0 0)` is near-black).
- `.dark { ... }` with the **dark** palette — same variable names, different values.

The handover between the two themes is purely the `dark` class on `<html>`. next-themes manages that class.

The `@layer base { body { @apply bg-background text-foreground; } }` line at the bottom makes sure the background and text always follow the theme variables.

### File 3: `apps/web/components/ui/*.tsx` — the primitives

Each file is one shadcn component:
- `button.tsx` — `Button` with variants (default, outline, secondary, ghost, destructive, link) and sizes.
- `slider.tsx` — a wrapper around Base UI's slider that accepts `value={[n]}` and emits arrays.
- `card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. Each is a styled `<div>`.
- `label.tsx` — a styled `<label>`.
- `alert.tsx` — `Alert`, `AlertTitle`, `AlertDescription` with `default`/`destructive` variants.
- `skeleton.tsx` — the gray pulsing placeholder we use while loading.

You can read each one — they're short (50–100 lines) and mostly just `className=` strings.

### File 4: `apps/web/components/theme-provider.tsx`

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

Three lines of meaningful code. The `"use client"` directive is the whole point — it makes this file the boundary between "server-rendered" and "browser-interactive." The parent (server) renders the tag; the child (this file) hydrates it in the browser.

`ComponentProps<typeof NextThemesProvider>` re-uses the third-party's prop types so we don't have to redeclare them. If next-themes adds a new prop in a future version, we get it for free.

### File 5: `apps/web/components/theme-toggle.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="outline" size="sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}>
      {mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
    </Button>
  );
}
```

The `mounted` trick deserves explanation. On the server we don't know which theme will resolve (it depends on the user's system preference and localStorage). If we render `"Dark mode"` on the server and the browser then renders `"Light mode"`, React complains about mismatched markup. The fix: render a *neutral* label (`"Theme"`) on the server and the first client render, then flip to the real label after `useEffect` runs. `useEffect` only runs in the browser, so by the time we look at `resolvedTheme`, we're past hydration and React is happy.

This is a one-off pattern you'll see in many "needs the browser to decide" UI bits.

### File 6: `apps/web/app/layout.tsx`

```tsx
<html lang="en" suppressHydrationWarning className={...}>
  <body>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  </body>
</html>
```

- `attribute="class"` — next-themes will set `class="dark"` (or unset it) on the element specified by `attribute`. By default this is `<html>`, which is what shadcn's CSS expects.
- `defaultTheme="system"` — match the OS by default.
- `enableSystem` — listen to OS changes (if the user switches their OS theme, ours follows).
- `disableTransitionOnChange` — prevents a janky animation flash during the switch.

### File 7: `apps/web/components/controls.tsx` — now using shadcn

The form is now inside a `<Card>`:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Detection settings</CardTitle>
    <CardDescription>...</CardDescription>
  </CardHeader>
  <CardContent>
    <Label>Image(s)</Label>
    <input type="file" multiple ... className="...file:bg-muted..." />
    ...
    <Slider value={[conf]} min={0.05} max={0.95} step={0.05}
      onValueChange={(v) => { const n = Array.isArray(v) ? v[0] : v; onConfChange(n!); }} />
    ...
    <Button onClick={onSubmit}>...</Button>
  </CardContent>
</Card>
```

Two things to notice:

#### shadcn's Slider speaks arrays

Look at `value={[conf]}` and the `onValueChange` handler. shadcn's `Slider` was built for *range* sliders that might have multiple thumbs (think "min price / max price"). Its value is *always* an array internally. For a single-thumb slider we pass a one-element array in and pull the first element out.

The defensive `Array.isArray(v) ? v[0] : v` is a belt-and-braces guard in case Base UI ever calls back with a plain number — fail safe rather than crash.

#### The file input keeps its native styling, mostly

shadcn doesn't ship a file-input component (there's no "right" design for it — every OS draws its own file picker). We keep the raw `<input type="file">` and just style the button piece with the `file:` Tailwind variant: `file:bg-muted file:rounded-md ...` styles the *internal* file button without touching the rest of the widget.

### File 8: `apps/web/components/result-card.tsx` — now a real Card

The big change: the outer `<article>` became `<Card>`, the file name went into `<CardTitle>`, the per-image badge moved into `<CardDescription>`, the loading placeholder became `<Skeleton>`, the error state became `<Alert variant="destructive">`. The detections `<table>` got proper hover/header styling using muted colors.

One detail worth flagging — the download link:

```tsx
<a
  href={`data:image/png;base64,${result.image_base64}`}
  download={downloadName}
  className={buttonVariants({ variant: "outline", size: "sm" })}
>
  Download annotated PNG
</a>
```

We can't put `<Button>` around `<a>` because shadcn's `Button` doesn't take an `asChild` prop here (the Base UI primitive uses a different polymorphism pattern). Instead we *export* the `buttonVariants` function from `button.tsx` and call it to get the same className string. Now the link looks identical to a button while still being a real, downloadable `<a>`. Same look, no behavior compromise.

### File 9: `apps/web/app/page.tsx` — header, hero, empty state, footer

The page got a real layout:

```tsx
<div className="min-h-full flex flex-col">
  <header>...DurianVision AI · ThemeToggle...</header>
  <main>
    <section className="mb-10">  {/* hero */}
      <h1>Count durians from a single canopy photo.</h1>
      <p>A custom YOLOv8 model (95.7% precision...)</p>
    </section>

    <Controls ... />
    {items.length > 1 && <p>Batch total: ...</p>}
    {items.length === 0 && <EmptyStateCard />}
    {items.map(...)}
  </main>
  <footer>Built with FastAPI · Next.js · YOLOv8 · shadcn/ui.</footer>
</div>
```

The empty-state `<Card>` with dashed border and a "no results yet" message gives the page somewhere to *be* before any detection has run. Without it, an empty page just looks broken.

---

## Part 4: The full lifecycle

The data flow didn't change from Phase 3:

1. Pick files → `onChange` → `setFiles([...])`.
2. Drag sliders → `onValueChange(array)` → unwrap → `setConf(n)` / `setIou(n)`.
3. Click button → `runDetection()` → `Promise.all(files.map(detectImage))`.
4. Each fetch resolves → per-item status flips → that one card re-renders.
5. Download link → `data:` URL + `download` attribute → browser saves the file.

Only the *visuals* changed. When you switch themes, only CSS variables flip — the React tree doesn't unmount or re-render, the components just get repainted with the new colors. That's the elegance of shadcn's CSS-variable approach.

---

## Part 5: What you now understand

- **What a design system is** and why shadcn's copy-paste model is different from MUI/Chakra.
- **Server vs. client components** — server components can import client components, not the other way around. `theme-provider.tsx` is the canonical "thin client wrapper" pattern.
- **CSS variables for theming.** One `class="dark"` flip, the whole palette changes.
- **The hydration mismatch problem** and the `mounted` flag trick to dodge it.
- **`suppressHydrationWarning`** as a precision tool for one element, not a generic mute.
- **Base UI / Radix primitives** — the unstyled, accessible building blocks beneath shadcn.
- **The `file:` Tailwind variant** for styling the internal button of a file input.
- **Sharing className via `buttonVariants(...)`** when you can't wrap a child in `<Button>` directly.

---

## Verified test results

- `npx shadcn init --defaults` — Tailwind v4 detected, components.json + button + utils written, globals.css rewritten.
- `npx shadcn add slider card label alert skeleton` — five files written into `components/ui/`.
- `npm install next-themes` — added.
- `npm run build` — TypeScript clean, both routes prerendered, Tailwind v4 + shadcn variables compiled without warnings.

End-to-end manual test (run yourself):

1. Backend: `python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000`
2. Frontend: `cd apps/web; npm run dev`
3. Open http://localhost:3000. You should see:
   - A header with the title and a "Dark mode" / "Light mode" toggle.
   - A hero section.
   - A "Detection settings" Card with file input, two sliders, and a button.
   - The empty-state card while no images have been run.
   - Clicking the theme toggle flips the entire page palette without a flash.

## How to restart this phase

Identical to Phase 3 — two terminals. Hot reload still works for everything (including theme changes, CSS edits, and component swaps).

---

**Up next — Phase 5:** Docker + Hugging Face Spaces deploy. We'll add static export for Next.js, mount the static output from FastAPI, write a multi-stage Dockerfile, and add the Spaces metadata so a single `docker build && docker push` ships a working portfolio link.
