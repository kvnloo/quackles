import { assetPath } from "@/lib/paths";

export function DuckFallback() {
  return (
    <div className="duck-fallback">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetPath("/poster/frame-white.jpg")} alt="" />
      <p className="sr-only">Microduck on the studio plate</p>
    </div>
  );
}
