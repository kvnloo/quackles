import { Fragment } from "react";
import { POSTER } from "@/lib/poster";

function Lines({ lines }: { lines: readonly string[] }) {
  return lines.map((line, i) => (
    <Fragment key={line}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}

/** Hermes poster stacks, adapted to Microduck (copy lives in lib/poster.ts). */
export function PosterHeroCopy() {
  return (
    <div className="hero-copy">
      <p className="hero-kicker">
        {POSTER.kicker} <i />
      </p>
      <h1>
        <Lines lines={POSTER.headline} />
      </h1>
      <p className="hero-label">
        <Lines lines={POSTER.substack} />
      </p>
      <p className="hero-note">
        <span>
          <Lines lines={POSTER.place} />
        </span>
        <span>
          <Lines lines={POSTER.scale} />
        </span>
      </p>
      <div className="hero-right">
        <p className="hero-right-lead">
          <Lines lines={POSTER.rightLead} />
        </p>
        <div className="hero-globe" aria-hidden>
          <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="0.9">
            <circle cx="20" cy="20" r="18.5" />
            <ellipse cx="20" cy="20" rx="8" ry="18.5" />
            <path d="M20 1.5v37M1.5 20h37M4.5 10.5h31M4.5 29.5h31" />
          </svg>
        </div>
        <p className="hero-right-sub">
          <Lines lines={POSTER.rightSub} />
        </p>
        <p className="hero-year">
          <span aria-hidden>{"//"}</span> {POSTER.year}
        </p>
      </div>
      <div className="crop-cross" aria-hidden>
        +
      </div>
    </div>
  );
}
