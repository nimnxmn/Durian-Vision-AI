"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes mounted-flag pattern: avoids hydration mismatch by deferring
  // theme-dependent UI until after the client has mounted.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
    </Button>
  );
}
