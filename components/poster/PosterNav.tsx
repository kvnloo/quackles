"use client";

import { LINKS } from "@/lib/story";
import { POSTER } from "@/lib/poster";
import { ThemeSlider } from "@/components/poster/ThemeSlider";

export function PosterNav() {
  return (
    <header className="site-nav">
      <a href="#top" className="wordmark">
        {POSTER.brand}
        <sup>TM</sup>
      </a>
      <nav>
        {POSTER.nav.map((item) => (
          <a key={item.label} href={item.href} target="_blank" rel="noreferrer">
            {item.label}
          </a>
        ))}
      </nav>
      <ThemeSlider />
      <a href={LINKS.store} target="_blank" rel="noreferrer" className="nav-cta">
        {POSTER.cta}
      </a>
    </header>
  );
}
