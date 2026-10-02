# Afterglow

A Chrome extension that gives websites a beautiful, comfortable charcoal theme.

Afterglow automatically themes light websites, keeps existing dark designs, and preserves photos, video, canvas, and background-image colors. Its dark popup includes a global switch and one appearance choice per site: Automatic or Original site. An optional global Afterglow accents switch adds a subtle lavender glow to keyboard-focused controls and hovered buttons. Preferences stay on your computer and apply across tabs, page paths, and browser restarts. Subdomains have independent settings.

## Install locally

The built extension is in `dist`.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `/Users/Jameson_C/Desktop/afterglow/dist`.
4. Pin Afterglow from Chrome's Extensions menu.
5. Existing websites connect automatically. Protected Chrome pages remain unavailable.

Open the toolbar popup and choose **Automatic** to darken light pages while keeping existing dark themes, or **Original site** to turn Afterglow off for that website. Choices save and apply automatically; there is no separate save or reset step. Turning **Afterglow across the web** off pauses the extension everywhere and preserves every site's choice. Existing saved Always dark choices now use Automatic; disabled site choices stay disabled.

**Afterglow accents** is off by default. Turn it on once to apply across all Afterglow-themed websites: a soft 1px lavender halo and 8px glow on enabled hovered buttons and keyboard-focused links and form controls. Existing shadows, focus outlines, colors, and layout are preserved. Accents appear only with Afterglow’s generated dark theme, never on native dark sites. The global preference stays saved while paused or in Original site mode. Eligible frames also use it. Existing per-site opt-ins migrate to globally enabled accents; a global off choice overrides legacy site values. Shadow-root controls are not covered in this version.

## Theme design

The generated theme uses charcoal `#181A1F` and soft off-white `#E6E8ED` as its baseline. Dark Reader adapts each site's original colors, retaining differences between page backgrounds, cards, menus, fields, secondary text, and disabled controls. Links and button links keep their adapted website colors rather than receiving a universal lavender override. Lavender branding remains in the popup and optional interaction glow. Typography, spacing, borders, and geometry remain under the website's control.

Browser checks generate matching article, shopping, and web-app screenshots in `design-previews/`. To compare with an earlier build, run the same fixtures with `AFTERGLOW_DESIGN_BASELINE=1` before rebuilding the changed theme. The baseline flag skips only new color distinction assertions; it does not change the theme itself.

## Build and verify

Requires Node.js 22 or newer and desktop Chrome 120 or newer.

```sh
npm ci
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Reload the extension on `chrome://extensions` after rebuilding. Afterglow reconnects to open websites automatically without reloading them or clearing drafts. The browser test uses a disposable Chromium profile, leaving your everyday Chrome profile alone. It exercises actual extension messaging, popup controls, native detection, dynamically added content, theme switching, forms, media, cross-tab changes, browser-restart persistence, accent interactions and shadow preservation, and automatic recovery of ten open tabs after extension reloads, preserved form drafts, and duplicate-injection safety.

## Permissions and privacy

HTTP/HTTPS website access lets Afterglow automatically style pages and their eligible embedded frames. `storage` saves preferences locally. `scripting` reconnects to existing tabs after installation or extension reloads. The background worker fetches website stylesheets when browser cross-origin rules prevent the theme engine from reading them. No accounts, analytics, cloud settings, remotely loaded executable code, or Afterglow service are used.

## Compatibility

Chrome internal pages, the Chrome Web Store, and the built-in PDF viewer are unavailable. Native-dark detection samples the original rendered page, resolves transparent and translucent layers, and excludes media colors. It rechecks theme changes automatically, including delayed dark themes. Detection remains heuristic and can misclassify unusual designs. YouTube and LinkedIn layouts are covered by representative local fixtures; authenticated live pages require manual verification. Choose Original site when you prefer a website’s own design. Complex charts, closed shadow roots, protected embeds, inaccessible stylesheets, and sites with unusual styling may need individual adjustments. Theme-engine page-script proxies are omitted for Manifest V3 compatibility, so some changes made directly through JavaScript stylesheet APIs may not be observed. Background images are deliberately left unchanged; images containing white backgrounds may remain bright. Avoid running a second dark-mode extension on the same page.

## Credits

Uses the locally bundled **Dark Reader 4.9.133** dynamic theme API, Copyright Dark Reader Ltd., distributed under the MIT license. See `THIRD_PARTY_LICENSES.txt` and the copy shipped in `dist`. The build omits Dark Reader's inline page-proxy injection to comply with Chrome extension Content Security Policy; it also guards stale runtime messages after extension reloads. It does not modify the installed dependency. All theme code is bundled locally.
