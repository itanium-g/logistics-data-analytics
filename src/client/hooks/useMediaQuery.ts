import { useEffect, useState } from "react";

/**
 * Small media-query hook shared by the shell. It intentionally has no
 * persistence or layout side effects; callers decide what a breakpoint means.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener?.("change", onChange);

    return () => media.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}
