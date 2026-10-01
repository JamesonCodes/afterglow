# Afterglow

A Chrome extension that gives websites a beautiful, comfortable charcoal theme.

Afterglow automatically themes light websites, keeps existing dark designs, and preserves photos, video, canvas, and background-image colors. Its dark popup includes a global switch, a site switch, a force-theme option, and a reset button. Preferences stay on your computer and apply across tabs, page paths, and browser restarts. Subdomains have independent settings.

## Install locally

The built extension is in `dist`.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `/Users/Jameson_C/Desktop/afterglow/dist`.
4. Pin Afterglow from Chrome's Extensions menu.
5. Refresh any websites already open when you installed it.

Open the toolbar popup to change the current website's settings. **Force Afterglow** overrides native-dark detection. **Reset site settings** returns that website to enabled, automatic detection. Turning the global switch off preserves every site's preferences.

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

Reload the extension on `chrome://extensions` after rebuilding, then refresh open pages. The browser test uses a disposable Chromium profile, leaving your everyday Chrome profile alone. It exercises actual extension messaging, popup controls, native detection, dynamically added content, theme switching, forms, media, cross-tab changes, and browser-restart persistence.

## Permissions and privacy

HTTP/HTTPS website access lets Afterglow automatically style pages and their eligible embedded frames. `storage` saves preferences locally. The background worker fetches website stylesheets when browser cross-origin rules prevent the theme engine from reading them. No accounts, analytics, cloud settings, remotely loaded executable code, or Afterglow service are used.

## Compatibility

Chrome internal pages, the Chrome Web Store, and the built-in PDF viewer are unavailable. Native-dark detection is heuristic; use Force Afterglow if it skips a light site or turn the site switch off when you prefer its original design. Complex charts, closed shadow roots, protected embeds, inaccessible stylesheets, and sites with unusual styling may need individual adjustments. Theme-engine page-script proxies are omitted for Manifest V3 compatibility, so some changes made directly through JavaScript stylesheet APIs may not be observed. Background images are deliberately left unchanged; images containing white backgrounds may remain bright. Avoid running a second dark-mode extension on the same page.

## Credits

Uses the locally bundled **Dark Reader 4.9.133** dynamic theme API, Copyright Dark Reader Ltd., distributed under the MIT license. See `THIRD_PARTY_LICENSES.txt` and the copy shipped in `dist`. The build omits Dark Reader's inline page-proxy injection to comply with Chrome extension Content Security Policy; it does not modify the installed dependency. All theme code is bundled locally.
