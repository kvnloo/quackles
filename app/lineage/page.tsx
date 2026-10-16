/* eslint-disable @next/next/no-img-element -- pre-encoded, fixed-size external WebP variants */
import type { Metadata } from "next";
import { assetPath, getAssetOrigin } from "@/lib/paths";
import archive from "@/content/lineage.json";
import "./lineage.css";
import timeline from "@/content/lineage-timeline.json";
import "./timeline.css";

export const metadata: Metadata = {
  title: "The full lineage · Quackles",
  description: "665 preserved scene versions, their references and current review picks. The human-in-the-loop artifact viewer used to make Quackles.",
};
const themes = ["day", "white", "blue", "dark", "night"] as const;
const imageRoot = `${getAssetOrigin() || assetPath("/quackles-assets")}/lineage/v1/`;
type Thumb = number | string;
function Preview({ image, label, href, reference }: { image: { caption: string; thumbs: {small: Thumb[]; large: Thumb[]} }; label: string; href: string; reference?: string }) {
  return <a className="lineage-preview" href={href} data-reference={reference} aria-label={`${label}: ${image.caption}`}>
    <span>{label}</span>
    <img src={imageRoot + image.thumbs.small[0]} srcSet={`${imageRoot + image.thumbs.small[0]} ${image.thumbs.small[1]}w, ${imageRoot + image.thumbs.large[0]} ${image.thumbs.large[1]}w`} sizes="(max-width: 600px) 140px, 110px" width={Number(image.thumbs.small[1])} height={Number(image.thumbs.small[2])} alt={image.caption} loading="lazy" fetchPriority="low" decoding="async" />
  </a>;
}
export default function LineagePage() {
  return <main className="lineage-page" data-lineage="true" data-timeline={assetPath(`/lineage/${timeline.dataset}`)} data-dataset={assetPath(`/lineage/${archive.dataset}`)} data-image-root={imageRoot}>
    <a className="lineage-skip" href="#timeline">Skip to the archive</a>
    <div className="lineage-wrap">
      <nav className="lineage-nav" aria-label="Lineage navigation"><a href={assetPath("/")}>← The poster</a><a href={assetPath("/process/")}>How it was made ↗</a></nav>
      <header className="lineage-hero">
        <div><p className="lineage-kicker">Quackles / The working archive</p><h1>Nothing<br />disappears.</h1></div>
        <div className="lineage-intro"><p>Five worlds. {archive.versions} versions.<br />Every attempt leaves a trace.</p><p>The artifact viewer used during creation to make human-in-the-loop review easier. References, current picks, the changes in between—and the experiments we did not keep.</p><a href="#timeline">Enter the full lineage ↓</a></div>
      </header>
      <section id="references" aria-labelledby="references-title">
        <div className="lineage-heading"><h2 id="references-title">The target. The current pick.</h2><p>Review selections ≠ release approval</p></div>
        <div className="lineage-comparisons">
          {themes.map(theme => <article key={theme} className="lineage-comparison"><h3>{theme}</h3><div className="lineage-pair">
            <Preview image={archive.references[theme]} label="Reference" reference={theme} href={imageRoot + archive.references[theme].thumbs.medium[0]} />
            <Preview image={archive.current[theme]} label={`Current / ${archive.current[theme].version}`} href={`#/${theme}/current`} />
          </div><button type="button" data-theme-jump={theme}>All {archive.counts[theme]} versions ↗</button></article>)}
        </div>
      </section>
      <section id="timeline" aria-labelledby="timeline-title">
        <div className="lineage-heading"><h2 id="timeline-title">Project timeline</h2><p>September 14 — October 15, 2026</p></div>
        <p className="lineage-origin">Project v0 was <a href="#/blue/v0">Blue, September 14 at 22:33 CDT</a>. Earlier White production tests remain in date order. Version numbers are per-scene archive indices, not render rounds or releases.</p>
        <div id="lineage-time-instrument" />
        <div className="lineage-heading"><h2>Every preserved artifact</h2><p>Full archive · independent of playback time</p></div>
        <form id="lineage-filters" className="lineage-filters" aria-label="Filter versions">
          <label>Scene<select id="lineage-theme" name="theme"><option value="">All five scenes</option>{themes.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
          <label>Phase<select id="lineage-phase" name="phase"><option value="">All phases</option></select></label>
          <label>Status<select name="status"><option value="">Every decision</option>{["current","shipped","kept","rejected","candidate","unknown"].map(s=><option key={s}>{s}</option>)}</select></label>
          <label className="lineage-search">Search<input name="query" type="search" placeholder="Version, round, date, hash…" autoComplete="off" /></label>
          <button id="lineage-order" type="button" aria-pressed="false">Newest first ↓</button><button id="lineage-reset" type="button">Reset</button>
        </form>
        <div className="lineage-grid-caption"><p id="lineage-count" role="status">Loading {archive.versions} preserved versions…</p><p id="lineage-keys">Arrow keys to explore · Enter to inspect · Esc to close</p></div>
        <div id="lineage-viewport" tabIndex={0} aria-label="Scene versions, scrollable archive" aria-describedby="lineage-keys"><div id="lineage-grid" role="list" aria-label="Filtered versions" /><p id="lineage-empty" hidden>No versions match. Try another filter.</p></div>
        <noscript><p>Enable JavaScript for the windowed archive, or <a href={assetPath(`/lineage/${archive.dataset}`)}>download the complete public dataset</a>. The references and current picks above work without JavaScript.</p></noscript>
      </section>
      <footer className="lineage-footer"><p>One entry per unique or near-identical image. Dates retain their source: file modification time is not proof of creation time. Historical status follows the source archive; “kept” is a scoped decision, not reference parity. Images are reduced reading aids, not native-pixel evidence.</p><p>Public snapshot / schema 1 · {archive.sha256.slice(0,16)} · <a href={assetPath(`/lineage/${archive.dataset}`)}>Dataset ↗</a></p><p><a href={assetPath("/process/#loop")}>Read about the review loop ↗</a></p></footer>
    </div>
    <dialog id="lineage-lightbox" aria-labelledby="lineage-detail-title" aria-describedby="lineage-detail-provenance">
      <div className="lineage-dialog-bar"><h2 id="lineage-detail-title">Version</h2><button id="lineage-close" type="button" autoFocus>Close ×</button></div>
      <div id="lineage-detail-image" />
      <p id="lineage-detail-caption" /><p id="lineage-detail-provenance" />
      <div className="lineage-dialog-bar"><button id="lineage-prev" type="button">← Previous</button><a id="lineage-detail-link" href="#timeline">Permalink ↗</a><button id="lineage-next" type="button">Next →</button></div>
    </dialog>
    <script type="module" defer src={assetPath("/lineage/viewer.mjs")} />
  </main>;
}
