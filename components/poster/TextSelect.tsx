"use client";

import { useEffect, useState } from "react";

export function TextSelect() {
  const [offer, setOffer] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let timer = 0;
    let startX = 0;
    let startY = 0;
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOffer(true), 520);
    };
    const move = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) {
        window.clearTimeout(timer);
      }
    };
    const up = () => window.clearTimeout(timer);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.textSelect = enabled ? "on" : "off";
  }, [enabled]);

  if (!offer && !enabled) return null;
  return (
    <button
      type="button"
      className="text-select-offer"
      data-testid="text-select-offer"
      onClick={() => {
        setEnabled((value) => !value);
        setOffer(true);
      }}
    >
      {enabled ? "Done selecting" : "Select text"}
    </button>
  );
}
