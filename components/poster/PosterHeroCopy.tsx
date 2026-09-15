import { POSTER } from "@/lib/poster";
import { SPECS } from "@/lib/story";

export function PosterHeroCopy() {
  return (
    <div className="hero-copy">
      <p className="hero-kicker">
        {POSTER.kicker}
        <span />
      </p>
      <h1>
        {POSTER.headline.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </h1>
      <dl className="hero-specs">
        {SPECS.map((spec) => (
          <div key={spec.label}>
            <dt>{spec.value}</dt>
            <dd>{spec.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
