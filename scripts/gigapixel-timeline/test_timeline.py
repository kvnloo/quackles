"""Verify the generated archive in Chromium, without a network connection."""
import argparse
import subprocess
import unittest
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/gigapixel-timeline"


def verify(chromium, screenshot):
    commits = subprocess.check_output(
        ["git", "log", "--reverse", "--format=%H",
         "origin/main..origin/preview/gigapixel-single"], cwd=ROOT, text=True
    ).splitlines()
    assert len(commits) >= 100, len(commits)
    requests, errors = [], []
    url = (DOCS / "index.html").as_uri()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=chromium)
        context = browser.new_context(
            offline=True, service_workers="block", viewport={"width": 1440, "height": 900}
        )
        context.on("request", lambda request: requests.append(request.url)
                   if request.url != url and not request.url.startswith("data:") else None)
        context.route("**/*", lambda route: route.continue_()
                      if route.request.url == url else route.abort())
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text)
                if message.type == "error" else None)
        page.goto(url, wait_until="load")
        rows = page.locator("article[data-commit]").evaluate_all(
            """rows => rows.map(row => [row.dataset.commit, Number(row.dataset.iteration)])"""
        )
        assert rows == [[sha, i] for i, sha in enumerate(commits, 1)], "Commit/order mismatch"
        visuals = page.locator("article .visual").evaluate_all(
            """nodes => nodes.map(node => node.tagName === 'IMG'
                ? (node.complete && node.naturalWidth > 0 &&
                   Math.max(node.naturalWidth, node.naturalHeight) <= 480 &&
                   node.src.startsWith('data:image/') ? 'image' : 'broken')
                : (node.textContent.includes('No visual') ? 'placeholder' : 'broken'))"""
        )
        assert len(visuals) == len(commits) and "broken" not in visuals, "Invalid/missing visuals"
        assert not requests, requests
        assert not errors, errors
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=screenshot, full_page=True)
        assert not requests and not errors, (requests, errors)
        browser.close()
    print(f"iterations={len(rows)} real={visuals.count('image')} "
          f"placeholders={visuals.count('placeholder')} external_requests={len(requests)} "
          f"console_errors={len(errors)}", flush=True)


class TimelineTest(unittest.TestCase):
    chromium = None
    screenshot = None

    def test_offline_archive(self):
        verify(self.chromium, self.screenshot)

    def test_contact_sheet_and_size(self):
        sheet = DOCS / "contact-sheet.png"
        self.assertLess(sheet.stat().st_size + (DOCS / "index.html").stat().st_size, 40_000_000)
        with Image.open(sheet) as image:
            self.assertEqual(image.format, "PNG")
            image.verify()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="Path to an installed Chromium or Chrome executable")
    parser.add_argument("--screenshot", type=Path)
    options = parser.parse_args()
    TimelineTest.chromium = options.chromium
    TimelineTest.screenshot = options.screenshot
    unittest.main(argv=[__file__], verbosity=2)
