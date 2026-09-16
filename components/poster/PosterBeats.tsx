import { LINKS, SPECS } from "@/lib/story";
export function PosterBeats() {
  return (
    <div className="story-overlays">
      <section className="motion-copy explode-copy" aria-label="Exploded view">
        <p className="hero-kicker">
          02 &nbsp; ASSEMBLY <i />
        </p>
        <h2>EXPLODE</h2>
      </section>
      <section className="motion-copy jump-copy" aria-label="Jump">
        <p className="hero-kicker">
          03 &nbsp; MOTION <i />
        </p>
        <h2>JUMP</h2>
      </section>
      <section
        className="specs-copy"
        data-testid="specs"
        aria-label="Product specifications"
      >
        <p className="hero-kicker">MICRODUCK / SPECIFICATIONS</p>
        <dl>
          {SPECS.map((spec) => (
            <div key={spec.label}>
              <dt>{spec.value}</dt>
              <dd>{spec.label}</dd>
            </div>
          ))}
        </dl>
        <a href={LINKS.github} target="_blank" rel="noreferrer">
          EXPLORE THE SOURCE ↗
        </a>
      </section>
    </div>
  );
}
