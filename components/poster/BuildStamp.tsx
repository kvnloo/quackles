import { BUILD_SHA_SHORT, BUILD_STAMP, BUILD_TIME } from "@/lib/build-info";

export function BuildStamp() {
  return (
    <footer className="site-foot">
      <p>Unofficial fan landing. Not Pollen Robotics.</p>
      <p className="build-stamp" title={BUILD_STAMP}>
        {BUILD_SHA_SHORT} · {BUILD_TIME}
      </p>
    </footer>
  );
}
