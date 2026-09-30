import { POSTER } from "@/lib/poster";
import { assetPath } from "@/lib/paths";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export function PosterNav() {
  return (
    <header className="site-nav">
      <a href="#top" className="wordmark" aria-label="Microduck, back to top">
        {POSTER.brand}
      </a>
      <nav aria-label="Official links">
        {POSTER.nav.map((item) => (
          <a key={item.label} href={item.href} {...external}>
            {item.label}
          </a>
        ))}
        <a
          href={assetPath("/process/")}
          className="nav-info"
          aria-label="Process: how this site was made"
          title="How this site was made"
        >
          <span aria-hidden>ⓘ</span> PROCESS
        </a>
        <a href={POSTER.cta.href} className="nav-cta" {...external}>
          {POSTER.cta.label} <span aria-hidden>↗</span>
        </a>
      </nav>
    </header>
  );
}
