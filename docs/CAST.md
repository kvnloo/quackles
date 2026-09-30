# Chromecast (Google Cast)

This works like Netflix or YouTube casting, not screen mirroring. The TV runs its own copy of the site at
`/cast-receiver/`. It downloads plates and deep-zoom tiles from GitHub Pages (the site plus
`kvnloo.github.io/quackles-assets`) by itself. The phone sends only small state messages over a Cast custom
channel: story progress, theme, zoom and focus. Each message is about 90 bytes, at most 30 a second. When you zoom
in on the phone, the TV fetches its own sharp tiles for the same crop.

## How it works

| Piece | Where |
|---|---|
| State protocol (encode/decode, clamping, ordering, pacer, jitter buffer) | `lib/cast/protocol.ts` |
| Phone: Cast button, lazy SDK, sends state | `components/cast/CastSender.tsx`, `lib/cast/sender.ts` |
| TV: receiver page, applies state to the same engine | `app/cast-receiver/page.cast.tsx`, `components/cast/CastReceiver.tsx`, `lib/cast/receiver.ts` |
| Cast SDK / test-shim transports | `lib/cast/transport.ts` |
| TV perf profile + tier cap | `lib/cast/engine/perf-profile.ts`, `lib/cast/engine/tier-probe.ts` |
| App ID | `lib/cast/config.ts` (`CAST_APP_ID`) |

- **Namespace:** `urn:x-cast:ai.quackles.state`.
  - The phone sends the full state (a snapshot) as soon as it connects, and again whenever the TV says hello (for
    example after a reload).
  - Each message also carries a sequence number and the phone's timestamp.
  - The TV drops out-of-order messages, and plays the rest back through a fixed **80 ms** buffer lined up on those
    timestamps. That keeps motion on the TV smooth even when Wi-Fi is jittery. The phone's own rendering never waits
    on this buffer.
- **TV layout:**
  - The 2:3 portrait plate is centred on the 16:9 screen, on the site's own theme-tinted background. The side bars
    show "Quackles / Microduck" and the current theme and connection status.
  - Cropping the plate to 16:9 would cut away about 60% of the picture. It would also stop the TV showing exactly
    what the phone is inspecting, because the zoom and focus values are fractions of the 2:3 frame on both screens.
- **TV perf profile:**
  - About 48 MiB of decoded images and 48 MiB of compressed downloads, with 2 decodes at a time.
  - The 1GP tier stops at 12910 px wide: the TV never loads the 25820 px level until it has been measured on a real
    device. The 201 MP Blue family goes up to 11584 px and is unaffected.
- **Build switch:** `NEXT_PUBLIC_CAST=1` turns casting on. Without it, `CAST_DEFAULT` in `next.config.ts` decides:
  `"1"` only on `preview/chromecast`.
  - With casting off, the build is byte-for-byte the same as the site without this feature. The receiver route and
    module swaps are only added to the config when casting is on.
  - With casting on:
    - the `page.cast.tsx` receiver route is built;
    - three imports are redirected at build time: `Landing` → `CastLanding`, `perf-profile` and `tier-probe` → the
      `lib/cast/engine/*` versions.
  - Cost of turning it on: first-load JS for `/` grows by +5.4 KiB raw / +2.8 KiB gzip. The Cast SDK and the sender
    code load only in Chrome, after the first paint, when the browser is idle.

## What the owner must do (one time)

1. **Create a Google Cast SDK developer account.**
   - Go to <https://cast.google.com/publish> and sign in with the Google account that should own the app.
   - Pay the one-time US$5 registration fee.
2. **Register a Custom Receiver app.**
   - Click *Add new application* → *Custom Receiver*.
   - Name: `Quackles`.
   - Receiver application URL:
     - production: `https://kvnloo.github.io/quackles/cast-receiver/`. This only exists once `main` is built with
       casting on (`CAST_DEFAULT = "1"` or `NEXT_PUBLIC_CAST=1`). `main` keeps it off until you decide to ship it.
     - to test the preview now: `https://kvnloo.github.io/quackles/preview/chromecast/cast-receiver/`. You can edit
       the URL later in the console; changes take about 15 minutes to reach devices.
   - Leave *Guest mode* off. Save, then copy the 8-character **Application ID** (for example `A1B2C3D4`).
3. **Register your Chromecast for testing.**
   - An unpublished app only runs on registered devices.
   - In the console go to *Cast Receiver Devices* → *Add new device*, and enter the Chromecast's serial number:
     - Google Home app → device → Settings → *Device information*; or
     - printed on the device or its box.
   - Reboot the Chromecast about 15 minutes after adding it (unplug it for 10 seconds).
4. **Set the App ID.**
   - To try it now without a commit, open the preview on your Android phone with `?castAppId=A1B2C3D4`:
     `https://kvnloo.github.io/quackles/preview/chromecast/?castAppId=A1B2C3D4`.
   - To make it permanent, in `lib/cast/config.ts` change the `CAST_APP_ID` fallback from `CAST_APP_ID_PLACEHOLDER`
     to `"A1B2C3D4"`. Pages builds pass no env, so the id must live in the repo. It is public; it is not a
     secret.
5. **Publish** (optional, after testing). Click *Publish* in the console. Any Chromecast can then run it, and step 3
   is no longer needed.

## Test steps (real devices)

1. Put the phone (Android, Chrome) on the **same Wi-Fi** as the Chromecast.
2. Open the preview URL from step 4. After the page paints, a round Cast icon appears under the right end of the nav.
   It stays hidden while no Cast device is found.
3. Tap the icon, then pick your Chromecast. The TV shows the plate, with "Live from your phone" on the right.
4. On the phone:
   - scroll the story: the TV should show the same frame;
   - swipe the theme and tap themes: the TV should blend the same way;
   - scroll back to the top, then pinch-zoom and pan on the hero: the TV follows about 0.1 s behind, then sharpens
     with its own tiles.
5. Reload the phone page: it rejoins automatically, and the TV picks up the current state.
6. Tap the icon again to stop. The TV app closes right away. If the phone just drops off instead, the TV closes after
   60 s.

To debug the TV (registered devices only):
- Open `chrome://inspect` in desktop Chrome on the same network.
- Under *Discover network targets* → *Configure*, add `<chromecast-ip>:9222`, then click *inspect* under the
  receiver.
- In the receiver page's console, `window.__QUACKLES_CAST__.getState()` reports messages received, messages dropped,
  the clock offset and the frames applied.

Local development: `NEXT_PUBLIC_CAST=1 npx next dev --webpack`. The module swaps are webpack plugins, so plain
`next dev` (Turbopack) shows no Cast button.

## Tests (headless, no device)

```bash
node --import ./scripts/register-ts-resolve.mjs scripts/cast-protocol-contracts.mjs    # protocol contracts
NEXT_PUBLIC_CAST=1 npm run build && OUT_DIR=out node scripts/cast-mirror-browser.mjs     # phone <-> TV mirror
node scripts/cast-flag-off-check.mjs <base-out> <flag-off-out> [<cast-on-out>]           # byte parity + JS delta
```

`cast-mirror-browser.mjs` runs the phone and the TV in two separate headless Chrome processes. They are bridged by a
BroadcastChannel stand-in for the Cast SDK (`?castTransport=bc`), which has the same interface as the real SDK
transport, plus a simulated 15–40 ms network. It checks:
- the Cast button causes no layout shift;
- the TV mirrors progress, theme and camera within a p95 bound;
- the TV reaches the same frame and the same theme, including with the phone in reduced-motion mode;
- the TV's zoom never steps backwards during a pinch;
- the TV sharpens with its own tiles, covering the mirrored crop;
- no message is larger than 220 B, and no more than 30 are sent a second;
- the phone requests no tile for the TV's view (checked against a phone run without casting);
- the TV resyncs after a reload;
- neither page throws an error.

## Known limits

- **iOS:** the Google Cast Web Sender SDK does not work in any iOS browser (Safari or Chrome for iOS). The button
  never appears there. Casting from iPhone would need a native app or AirPlay, and neither is in scope. Android
  Chrome and desktop Chrome work.
- **Chromecast hardware:**
  - The TV is weak on GPU and memory. The TV perf profile and the 12910 px tier cap are cautious guesses and have not
    been measured on a device. That includes decode throughput, how long tiles take to sharpen, frame rate while
    zooming, and whether a 1080p or 4K device renders the page at 1280×720 or 1920×1080.
  - Measure on the device before raising the cap for the 1GP (25820 px) tier.
- **1GP tiles:**
  - Production serves 1GP only for the hidden mushroom scene. Other themes serve it only with
    `?inspectionCandidates=1`, which the TV ignores.
  - On the TV the mushroom scene stops at the 12910 px level.
- **Latency:** the TV deliberately runs 80 ms behind the phone, plus network time: about 90–120 ms in total in
  headless tests. That is the price of smooth playback. `RECEIVER_DELAY_MS` in `lib/cast/protocol.ts` is the knob.
- **Version:**
  - The TV runs whatever build is deployed at the registered receiver URL.
  - If the phone is on a different build, the TV shows "Phone is on another version". It still mirrors, because the
    state format is versioned separately (`v:1`).
