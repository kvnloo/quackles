#!/usr/bin/env node
/**
 * Verify the deployed Quackles production site is healthy.
 *
 * Checks:
 *  - Sequence state: ready=true, manifestId non-null, frameCount>0, errors=[]
 *  - Inspection state: maxZoom>1
 *  - Manifest contains logical paths (no baked absolute URLs)
 *  - Console has no errors
 *  - Representative assets return 200
 *
 * Usage:
 *   node scripts/hosting/verify.mjs
 *
 * Environment:
 *   BASE_URL  – production URL (default: https://quackles-v0.vercel.app)
 *   CHROME    – Chromium executable (default: /usr/bin/chromium)
 */

import { chromium } from '../../node_modules/playwright-core/index.mjs';

const BASE_URL = process.env.BASE_URL || 'https://quackles-v0.vercel.app';
const MANIFEST_URL = `${BASE_URL}/preview-scene/sequence/manifest.json`;
const CHROME = process.env.CHROME || '/usr/bin/chromium';

const LOGS = [];
function log(msg) { LOGS.push(msg); console.log(msg); }

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--headless=new'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordConsole: true });
  const page = await context.newPage();

  page.on('console', msg => LOGS.push(`CONSOLE [${msg.type()}]: ${msg.text()}`));
  const networkLogs = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('manifest.json') || url.includes('quackles-assets') || url.includes('.webp')) {
      networkLogs.push({ status: resp.status(), url, type: resp.request().resourceType() });
    }
  });

  try {
    log(`\n=== NAVIGATING TO ${BASE_URL} ===`);
    const navResp = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log(`Nav status: ${navResp.status()}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Sequence state
    const seqState = await page.evaluate(() => {
      if (typeof window.__QUACKLES_SEQUENCE__ !== 'undefined') {
        return window.__QUACKLES_SEQUENCE__.getState();
      }
      return { error: '__QUACKLES_SEQUENCE__ not defined' };
    });
    log(`\n=== SEQUENCE STATE ===`);
    log(JSON.stringify(seqState, null, 2));

    // Inspection state
    const inspState = await page.evaluate(() => {
      if (typeof window.__QUACKLES_INSPECTION__ !== 'undefined') {
        return window.__QUACKLES_INSPECTION__.getState();
      }
      return { error: '__QUACKLES_INSPECTION__ not defined' };
    });
    log(`\n=== INSPECTION STATE ===`);
    log(JSON.stringify(inspState, null, 2));

    // Manifest
    log(`\n=== MANIFEST VERIFICATION ===`);
    const manifestResp = await fetch(MANIFEST_URL);
    const manifest = JSON.parse(await manifestResp.text());
    log(`Manifest status: ${manifestResp.status}`);
    log(`Manifest frames: ${manifest.frames?.length}`);

    // Check for absolute URLs in manifest
    let absoluteCount = 0;
    let logicalCount = 0;
    for (const frame of manifest.frames || []) {
      for (const theme of Object.keys(frame.assets || {})) {
        const assets = frame.assets[theme];
        if (Array.isArray(assets)) {
          for (const asset of assets) {
            if (asset.tiles && asset.tiles.urlTemplate) {
              const tpl = asset.tiles.urlTemplate;
              if (tpl.startsWith('http')) absoluteCount++;
              else if (tpl.startsWith('/quackles-assets/')) logicalCount++;
            }
            if (asset.url) {
              const url = asset.url;
              if (url.startsWith('http')) absoluteCount++;
              else if (url.startsWith('/quackles-assets/')) logicalCount++;
            }
          }
        }
      }
    }
    log(`Logical paths: ${logicalCount}`);
    log(`Absolute URLs: ${absoluteCount}`);

    // Verify a tile URL resolves
    log(`\n=== TILE RESOLUTION ===`);
    const bpFrame = manifest.frames?.find(f => f.id === 'p0000000');
    if (bpFrame?.assets?.blue) {
      const detailAsset = bpFrame.assets.blue.find(a => a.tiles);
      if (detailAsset?.tiles?.urlTemplate) {
        const tpl = detailAsset.tiles.urlTemplate;
        const concreteUrl = BASE_URL + tpl.replace('{level}','0').replace('{x}','0').replace('{y}','0');
        log(`Sample tile URL: ${concreteUrl}`);
        const tileResp = await fetch(concreteUrl);
        log(`Tile status: ${tileResp.status}`);
        log(`Tile content-type: ${tileResp.headers.get('content-type') || 'N/A'}`);
      }
    }

    // Console errors
    const errors = LOGS.filter(l => l.includes('[error]'));
    log(`\n=== CONSOLE ===`);
    log(`Errors: ${errors.length === 0 ? 'clean' : errors.length}`);
    for (const e of errors) log(e);

    // Network
    log(`\n=== NETWORK (relevant) ===`);
    for (const e of networkLogs) log(`[${e.status}] ${e.type}: ${e.url}`);

    // Screenshot
    await page.screenshot({ path: '/tmp/verify-deployed-screenshot.png', fullPage: false });
    log(`\nScreenshot: /tmp/verify-deployed-screenshot.png`);

    // Summary
    log(`\n=== VERIFICATION SUMMARY ===`);
    const checks = {
      'Sequence ready': seqState.ready === true,
      'ManifestId non-null': seqState.manifestId != null,
      'FrameCount > 0': seqState.frameCount > 0,
      'Errors empty': (Array.isArray(seqState.errors) ? seqState.errors.length === 0 : false),
      'Inspection maxZoom > 1': inspState.maxZoom > 1,
      'No absolute URLs in manifest': absoluteCount === 0,
      'Console clean': errors.length === 0,
    };

    let allOk = true;
    for (const [name, ok] of Object.entries(checks)) {
      log(`${name}: ${ok ? 'PASS ✓' : 'FAIL ✗'}`);
      if (!ok) allOk = false;
    }

    log(`\nOVERALL: ${allOk ? 'PASSED ✓' : 'FAILED ✗'}`);
    process.exit(allOk ? 0 : 1);

  } catch (err) {
    log(`FATAL: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
