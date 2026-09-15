import { POSTER } from "@/lib/poster";

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
      <ul>
        {POSTER.specs.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="hero-coords">
        {POSTER.coords.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <p className="hero-manifesto">
        {POSTER.manifesto.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
    </div>
  );
}
