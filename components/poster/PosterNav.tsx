import { LINKS } from "@/lib/story";
import { assetPath } from "@/lib/paths";

export function PosterNav() {
  return (
    <header className="site-nav">
      <a href="#top" className="wordmark" aria-label="Nous fan study, back to top">
        Nous<span>™</span>
      </a>
      <nav aria-label="Official links">
        <a href={LINKS.hermes} target="_blank" rel="noreferrer">
          HERMES ↗
        </a>
        <a href={LINKS.pollen} target="_blank" rel="noreferrer">
          POLLEN ↗
        </a>
        <a
          href={assetPath("/process")}
          className="nav-info"
          aria-label="How this site was made"
          title="How this was made"
        >
          <span aria-hidden>ⓘ</span>
          <span className="sr-only">Process</span>
        </a>
      </nav>
    </header>
  );
}
