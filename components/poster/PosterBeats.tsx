import { LINKS, STORY } from "@/lib/story";

export function PosterBeats() {
  return (
    <div className="story-beats">
      {STORY.map((section) => {
        const isHero = section.id === "hero";
        return (
          <section
            key={section.id}
            className={isHero ? "beat beat-hero" : "beat"}
            aria-label={section.title || "Microduck"}
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
                {section.id === STORY[STORY.length - 1]?.id ? (
                  <div className="beat-cta">
                    <a className="btn-solid" href={LINKS.store} target="_blank" rel="noreferrer">
                      Pre-order $399
                    </a>
                    <a className="btn-ghost" href={LINKS.github} target="_blank" rel="noreferrer">
                      GitHub
                    </a>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
