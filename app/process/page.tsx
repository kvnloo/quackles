import type { Metadata } from "next";
import Image from "next/image";
import { assetPath } from "@/lib/paths";
import { chapters, processLinks } from "@/content/process";
import { processImages } from "@/content/process-images";

export const metadata: Metadata = {
  title: "How this was made · Quackles · Microduck",
  description: "From a robot and a poster to five rendered worlds: references, failed experiments, critique walkthroughs, deep zoom and the lessons behind Quackles.",
};

function EvidenceFigure({ id, hero = false }: { id: string; hero?: boolean }) {
  const image = processImages[id];
  return (
    <figure className={`process-figure${hero ? " process-hero-figure" : ""}${image.height > image.width * 1.8 ? " process-portrait-figure" : ""}`}>
      <a className="process-image-link" href={assetPath(image.src)} target="_blank" rel="noopener noreferrer" aria-label={`Open larger image: ${image.alt}`}>
        <Image
          src={assetPath(image.src)}
          alt={image.alt}
          width={image.width}
          height={image.height}
          unoptimized
          loading={hero ? "eager" : "lazy"}
          fetchPriority={hero ? "high" : "auto"}
          sizes="(max-width: 767px) 100vw, 1200px"
        />
      </a>
      <figcaption>{image.caption}</figcaption>
    </figure>
  );
}

export default function ProcessPage() {
  return (
    <main className="process-page" id="top">
      <a className="process-skip" href="#chapters">Skip to the story</a>
      <div className="process-wrap">
        <nav className="process-nav" aria-label="Process navigation">
          <a href={assetPath("/")}>← Back to the poster</a>
          <a href="#credits">Sources</a>
        </nav>

        <header className="process-hero">
          <div className="process-hero-copy">
            <p className="process-kicker">Quackles / Making of</p>
            <h1>How this<br />was made</h1>
            <p className="process-deck">A robot, five worlds, and the experiments that taught us how to see what was still wrong.</p>
            <a className="process-hero-link" href="#walkthroughs">Explore the critique sheets ↗</a>
          </div>
          <EvidenceFigure id="hero" hero />
        </header>

        <div className="process-introduction">
          <p>Not a straight line from prompt to finished image. A record of references, renders, rejected fixes and decisions that changed the work.</p>
          <p className="process-note">September 14 - October 15, 2026. Night is still in progress. Read the short story, or open any chapter for the working notes and comparisons.</p>
        </div>
        <nav className="process-contents" aria-label="In this story">
          {chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`}>{chapter.title}</a>)}
        </nav>

        <article id="chapters" aria-label="The making of Quackles">
          {chapters.map(chapter => (
            <section className={`process-chapter process-chapter-${chapter.id}`} id={chapter.id} key={chapter.id} aria-labelledby={`${chapter.id}-title`}>
              <div className="process-chapter-copy">
                {chapter.status && <p className="process-status">{chapter.status} / October 15</p>}
                <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
                <p>{chapter.intro}</p>
              </div>
              <EvidenceFigure id={chapter.image} />
              <div className="process-dives">
                {chapter.dives.map((dive, index) => (
                  <details key={dive.title} id={`${chapter.id}-detail-${index + 1}`}>
                    <summary>{dive.title}</summary>
                    <div className="process-dive-body">
                      <div className="process-prose">
                        {dive.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                        {dive.quote && (
                          <blockquote>
                            <p>“{dive.quote.text}”</p>
                            <cite>{dive.quote.attribution}</cite>
                          </blockquote>
                        )}
                      </div>
                      {dive.images && <div className="process-gallery" aria-label={`${dive.title}: evidence gallery`}>
                        {dive.images.map(id => <EvidenceFigure id={id} key={id} />)}
                      </div>}
                      <p className="process-source">Production record: {dive.source}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </article>

        <footer className="process-foot">
          <h2>Sources & further reading</h2>
          <ul>{processLinks.map(link => <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>)}</ul>
          <div className="process-colophon">
            <p>Unofficial fan study. Not affiliated with Nous Research or Pollen Robotics.</p>
            <a href="#top">Back to top ↑</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
