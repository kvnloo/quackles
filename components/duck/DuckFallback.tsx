"use client";

import { COLORWAYS, getColorway } from "@/lib/colorways";
import { poseAt, sectionIndex } from "@/lib/pose";
import { useExperience } from "@/components/providers/ExperienceProvider";

function DuckSvg({
  colorwayId,
  explode,
  crouch,
  recover,
  skate,
  grab,
  beak,
}: {
  colorwayId: ReturnType<typeof getColorway>["id"];
  explode: number;
  crouch: number;
  recover: number;
  skate: number;
  grab: number;
  beak: number;
}) {
  const c = getColorway(colorwayId);
  const tilt = recover * 78;
  const drop = crouch * 28;
  const headY = -explode * 36;
  const neckY = -explode * 12;
  const legSpread = explode * 22;
  const beakOpen = 8 + beak * 18;

  return (
    <svg viewBox="0 0 220 280" className="h-full w-full" aria-hidden>
      <g transform={`translate(110 ${168 + drop}) rotate(${tilt})`}>
        <g transform={`translate(${-legSpread} 0)`}>
          <rect x="-42" y="18" width="22" height="38" rx="7" fill={c.shell} />
          <rect x="-40" y="52" width="18" height="28" rx="4" fill="#161616" />
          <rect x="-46" y="76" width="32" height="14" rx="5" fill={c.trim} />
          <rect x="-47" y="88" width="34" height="8" rx="3" fill={c.sole} />
          {skate > 0.2 && (
            <>
              <circle cx="-38" cy="102" r="7" fill="#222" />
              <circle cx="-22" cy="102" r="7" fill="#222" />
            </>
          )}
        </g>
        <g transform={`translate(${legSpread} 0)`}>
          <rect x="20" y="18" width="22" height="38" rx="7" fill={c.shell} />
          <rect x="22" y="52" width="18" height="28" rx="4" fill="#161616" />
          <rect x="14" y="76" width="32" height="14" rx="5" fill={c.trim} />
          <rect x="13" y="88" width="34" height="8" rx="3" fill={c.sole} />
          {skate > 0.2 && (
            <>
              <circle cx="22" cy="102" r="7" fill="#222" />
              <circle cx="38" cy="102" r="7" fill="#222" />
            </>
          )}
        </g>

        <rect x="-38" y="-8" width="76" height="48" rx="16" fill={c.shell} />
        <rect x="-14" y="8" width="28" height="16" rx="4" fill="#1c1c1c" />

        <g transform={`translate(0 ${neckY})`}>
          <rect x="-14" y="-42" width="28" height="18" rx="4" fill="#161616" />
          <rect x="-14" y="-62" width="28" height="18" rx="4" fill="#161616" />
          <circle cx="16" y="-33" r="5" fill="#c9c9c9" />
          <circle cx="16" y="-53" r="5" fill="#c9c9c9" />
        </g>

        <g transform={`translate(0 ${headY - 78})`}>
          <ellipse cx="4" cy="0" rx="52" ry="38" fill={c.shell} />
          <rect x="-40" y="-14" width="72" height="36" rx="10" fill={c.visor} />
          <circle cx="-12" cy="4" r="14" fill={c.eyeRing} />
          <circle cx="-12" cy="4" r="7" fill="#111" />
          <circle cx="10" cy="0" r="3" fill="#111" />
          <circle cx="28" cy="-10" r="3" fill="#ff3b30" />
          <rect x="-36" y="22" width="78" height="14" rx="5" fill={c.beak} />
          <rect
            x="-30"
            y={28 + beakOpen * 0.35}
            width="66"
            height="7"
            rx="3"
            fill={c.beak}
            transform={`rotate(${beakOpen * 0.4} -30 32)`}
          />
        </g>

        {grab > 0.15 && (
          <rect x="36" y={40 + (1 - grab) * 24} width="16" height="16" rx="2" fill="#4f7cff" />
        )}
      </g>
    </svg>
  );
}

export function DuckFallback() {
  const { colorway, progress } = useExperience();
  const pose = poseAt(progress);
  const section = sectionIndex(progress);
  const flock = pose.flock;

  return (
    <div className="relative flex h-full w-full items-end justify-center bg-transparent pb-[6%]">
      {flock > 0.2 ? (
        <div className="relative z-[1] flex w-full items-end justify-center gap-1 px-4">
          {COLORWAYS.map((c) => (
            <div key={c.id} className="h-[46%] w-1/4">
              <DuckSvg
                colorwayId={c.id}
                explode={0}
                crouch={0.06}
                recover={0}
                skate={0}
                grab={0}
                beak={0.2}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="relative z-[1] h-[92%] w-[78%] translate-x-[6%]">
          <DuckSvg
            colorwayId={colorway}
            explode={pose.explode}
            crouch={pose.crouch}
            recover={pose.recover}
            skate={pose.skate}
            grab={pose.grab}
            beak={pose.beak}
          />
        </div>
      )}
      <p className="sr-only">Illustration of Microduck, chapter {section + 1}</p>
    </div>
  );
}
