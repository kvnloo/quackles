import { assetPath } from "@/lib/paths";

export function DuckFallback() {
  return (
    <div className="duck-fallback">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="poster-plate" src={assetPath("/poster/frame-cobalt.jpg")} alt="" />
      <p className="sr-only">Microduck on cobalt studio</p>
    </div>
  );
}
