"use client";

import { useEffect } from "react";

// Fades sections in as they scroll into view. Content is fully visible without JavaScript:
// the hidden starting state (.rv) is only added here, after the page has loaded.
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".lp [data-reveal]"));
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) continue; // already on screen: leave it visible
      el.classList.add("rv");
      io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return null;
}
