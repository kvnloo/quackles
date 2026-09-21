/* eslint-disable @next/next/no-img-element -- Responsive pre-encoded assets are served by a static export. */
"use client";
import { useEffect, useRef } from "react";
import { assetPath } from "@/lib/paths";
import { BUILD_SHA } from "@/lib/build-info";

import { getThemeSnapshot, plateWeights, subscribeTheme } from "@/lib/theme";
const posterAsset = (path: string) =>
  assetPath(`${path}?v=${encodeURIComponent(BUILD_SHA)}`);

export function PosterPlates() {
  const white = useRef<HTMLImageElement>(null),
    cobalt = useRef<HTMLImageElement>(null),
    dark = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const sync = () => {
      const w = plateWeights(getThemeSnapshot());
      if (white.current) white.current.style.opacity = "1";
      if (cobalt.current)
        cobalt.current.style.opacity = String(
          w.dark < 1 ? w.cobalt / (1 - w.dark) : 0,
        );
      if (dark.current) dark.current.style.opacity = String(w.dark);
    };
    sync();
    [white, cobalt, dark].forEach(
      (ref) => void ref.current?.decode().catch(() => {}),
    );
    return subscribeTheme(sync);
  }, []);
  return (
    <div className="poster-plates">
      <img
        ref={white}
        className="poster-plate"
        src={posterAsset("/preview-scene/frame-white-1024.webp")}
        srcSet={`${posterAsset("/preview-scene/frame-white-640.webp")} 640w, ${posterAsset("/preview-scene/frame-white-1024.webp")} 1024w, ${posterAsset("/preview-scene/frame-white-1536.webp")} 1536w`}
        sizes="(max-width:430px) 100vw,430px"
        width={1024}
        height={1536}
        fetchPriority="high"
        decoding="async"
        alt="Microduck standing on limestone plinths, with a cobalt glass orb and printed art in a paper studio"
      />
      <img
        ref={cobalt}
        className="poster-plate"
        src={posterAsset("/preview-scene/frame-cobalt-1024.webp")}
        srcSet={`${posterAsset("/preview-scene/frame-cobalt-640.webp")} 640w, ${posterAsset("/preview-scene/frame-cobalt-1024.webp")} 1024w, ${posterAsset("/preview-scene/frame-cobalt-1536.webp")} 1536w`}
        sizes="(max-width:430px) 100vw,430px"
        width={1024}
        height={1536}
        style={{ opacity: 0 }}
        decoding="async"
        alt=""
        aria-hidden
      />
      <img
        ref={dark}
        className="poster-plate"
        src={posterAsset("/preview-scene/frame-dark-1024.webp")}
        srcSet={`${posterAsset("/preview-scene/frame-dark-640.webp")} 640w, ${posterAsset("/preview-scene/frame-dark-1024.webp")} 1024w, ${posterAsset("/preview-scene/frame-dark-1536.webp")} 1536w`}
        sizes="(max-width:430px) 100vw,430px"
        width={1024}
        height={1536}
        style={{ opacity: 0 }}
        decoding="async"
        alt=""
        aria-hidden
      />
    </div>
  );
}
