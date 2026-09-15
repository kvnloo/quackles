import { LINKS, SPECS, STORY } from "@/lib/story";

export function StoryOverlay() {
  return (
    <div className="story-beats">
      {STORY.map((section) => {
        const isHero = section.id === "hero";
        return (
          <section
            key={section.id}
            className={isHero ? "beat beat-hero" : "beat"}
            aria-label={section.title ? section.title.replace("\n", " ") : "Microduck"}
          >
            {isHero ? (
              <div className="beat-spacer" />
            ) : (
              <div className="beat-card">
                <p className="beat-kicker">
                  {section.kicker}
                  <span />
                </p>
                <h2>
                  {section.title.split("\n").map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </h2>
                <p className="beat-body">{section.body}</p>
                {section.id === "anatomy" && (
                  <ul className="beat-list">
                    <li>01  visor camera + 8×8 ToF</li>
                    <li>02  grasping beak</li>
                    <li>03  stacked neck servos</li>
                    <li>04  RK3566 · 15 motors</li>
                  </ul>
                )}
                {section.id === "cta" && (
                  <div className="beat-cta">
                    <dl>
                      {SPECS.map((s) => (
                        <div key={s.label}>
                          <dt>{s.value}</dt>
                          <dd>{s.label}</dd>
                        </div>
                      ))}
                    </dl>
                    <a className="btn-solid" href={LINKS.store} target="_blank" rel="noreferrer">
                      Pre-order · $399
                    </a>
                    <a className="btn-ghost" href={LINKS.official} target="_blank" rel="noreferrer">
                      Official product page
                    </a>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
