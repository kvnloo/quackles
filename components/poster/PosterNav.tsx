import { LINKS } from "@/lib/story";
export function PosterNav() {
  return (
    <header className="site-nav">
      <a href="#top" className="wordmark" aria-label="Microduck, back to top">
        microduck<span>®</span>
      </a>
      <nav aria-label="Product">
        <a href={LINKS.github} target="_blank" rel="noreferrer">
          SOURCE ↗
        </a>
        <a href={LINKS.official} target="_blank" rel="noreferrer">
          POLLEN ↗
        </a>
      </nav>
    </header>
  );
}
