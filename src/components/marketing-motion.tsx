"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function MarketingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = element.querySelectorAll<HTMLElement>(".approach-section>div,.section-title-row,.service-feature,.service-note,.workflow-section>h2,.workflow-grid>article,.pricing-explorer,.workspace-banner>div,.story-section>div,.faq-section>div,.site-cta>*,.footer-top");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("motion-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: "0px 0px -32px 0px" });
    targets.forEach((target) => {
      // Only prepare offscreen content: never flash or conceal the initial viewport.
      if (!preference.matches && target.getBoundingClientRect().top >= window.innerHeight) {
        target.classList.add("motion-ready");
        observer.observe(target);
      }
    });
    const revealFocused = (event: FocusEvent) => {
      if (event.target instanceof Element) event.target.closest(".motion-ready")?.classList.add("motion-visible");
    };
    const stopMotion = () => { if (preference.matches) targets.forEach((target) => target.classList.add("motion-visible")); };
    element.addEventListener("focusin", revealFocused);
    preference.addEventListener("change", stopMotion);
    document.documentElement.classList.add("coastal-scroll");
    return () => {
      observer.disconnect();
      element.removeEventListener("focusin", revealFocused);
      preference.removeEventListener("change", stopMotion);
      document.documentElement.classList.remove("coastal-scroll");
      targets.forEach((target) => target.classList.remove("motion-ready", "motion-visible"));
    };
  }, []);
  return <div className="marketing-site" ref={root}>{children}</div>;
}
