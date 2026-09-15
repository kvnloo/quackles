import { STORY } from "@/lib/story";

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
                <h2>{section.title}</h2>
                <p className="beat-body">{section.body}</p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
