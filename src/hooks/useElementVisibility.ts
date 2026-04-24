import { useEffect, useState, type RefObject } from "react";

interface UseElementVisibilityOptions {
  rootMargin?: string;
  threshold?: number;
}

export function useElementVisibility<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = "240px 0px", threshold = 0.05 }: UseElementVisibilityOptions = {},
) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting ?? false);
      },
      {
        rootMargin,
        threshold,
      },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, rootMargin, threshold]);

  return visible;
}

