# vendor

Third-party files the page needs, kept in the repository so that it loads nothing from another site (a CDN that is down, changed or compromised cannot break or take over the app; it also runs offline, which the Revit add-in's bundled copy needs to).

| Folder | What | Version | Licence |
|---|---|---|---|
| `leaflet/` | Leaflet (the site map) | 1.9.4 | BSD-2-Clause (`LICENSE`) |
| `suncalc/` | SunCalc (sun position), the UMD build `suncalc.cjs`, renamed `.js` so a static server gives it a script type | 2.0.2 | BSD-2-Clause (`LICENSE`) |
| `tabler-icons/` | Tabler Icons webfont (the `ti ti-…` icons); the minified stylesheet with the TrueType source dropped, the `woff2` and `woff` files | 3.4.0 | MIT (`LICENSE`) |
| `fonts/titillium-web/` | Titillium Web, 400 / 600 / 700 and 400 italic, `latin` and `latin-ext`, `woff2`, from `@fontsource/titillium-web` | 5.3.0 | SIL Open Font License 1.1 (`OFL.txt`) |

To update one: `npm pack <package>@<version>`, unpack, copy the same files, change the version here. `tools/csp-test.js` fails when `index.html` loads anything from outside this site again.

Not vendored on purpose: the map *tiles* (OpenStreetMap) and the address lookup (Nominatim) are live data, not assets; the page's Content-Security-Policy allows exactly those.
