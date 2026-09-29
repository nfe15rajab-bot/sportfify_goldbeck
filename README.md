# Sportify: the web app

Sportify helps you design **sports and gardens on a roof**. This is its web app, where the design decisions are made: the site and its conditions, sport fields and garden pieces, **Combine** (manual or algorithmic placement on the real roof outline), **Results**, **Compare** (up to three saved iterations side by side), Kinetics and the deliverables. The layout then goes to Revit 2025, where it becomes real model elements. The rule: *decide in the web app, build in Revit*.

A student project of the **Digital Tools and Methods – Group of Sports and Gardens** (TH OWL, School of Architecture, MID project), in partnership with **GOLDBECK**. Led by Nada, Moamen, Sukriti and Ali, and developed with the main assistance of Claude (Anthropic). **Beta: results are preliminary.**

## Use it

**Install Sportify with its installer.** It is built from the companion repository [Sportify_Revit_and_API](https://github.com/nfe15rajab-bot/Sportify_Revit_and_API), whose README has the steps. The installer bundles this web app together with the local API it needs (the catalogue, build-ups, plants and prices) and the Revit add-in. Afterwards, open the app from the Start menu: **Sportify web app** (`http://localhost:5107/`). Inside Revit, it is docked in the Sportify pane.

**Quickest look:** click **Next → I've used Sportify before → Load Goldbeck IFC Roof – Prebuilt Session**. Pick *Low Roof, Sports* or *High Roof, Garden*: two real roofs from the GOLDBECK model. The garden roof comes with three saved iterations (planted, social, quiet) in **Compare**.

## Run from source (developers)

The app is plain HTML/CSS/JavaScript with no build step and no CDN: `vendor/` holds Leaflet, SunCalc, Tabler icons and the fonts, and the Content-Security-Policy allows only this origin.

```
npx serve . -l 8123
```

The local API (`Sportify.Api` in the other repository) is expected on `localhost:5107`, and the Revit add-in on `localhost:5679`. Without them the app still works in 2D, with built-in fallback values. The web app is allowed only on ports 8123, 8124 and 5107. After changing any script, run `python bump-build.py` so browsers load the new files.

Tests: the `tools/*-test.js` files run under Node against the real scripts. The whole suite (web + add-in + API) is `node Sportify.Simulation/Tools/run-checks.js --web <this folder>` in the other repository. CI runs it on every push.

## Where things are

| File(s) | What |
|---|---|
| `index.html`, `style.css`, `main.js` | the page and the tab switching |
| `sessionGate.js`, `welcome.js`, `quiz.js`, `tour.js` | landing page, first-run quiz and guided tour |
| `siteController.js`, `siteField.js`, `siteWeather.js`, `windZones.js`, `sunPosition.js` | Site and Site conditions |
| `combineController.js`, `combineField.js`, `rules.js`, `algoPlacement*.js`, `gardenPresets.js` | Combine: the board, the design rules, algorithmic placement, garden presets |
| `analysisController.js`, `resultsStore*.js`, `compareController.js` | Results and Compare |
| `prebuiltSessions.js` | the two built-in GOLDBECK sessions (and the garden roof's saved iterations) |
| `revitBridge.js`, `localSession.js`, `workspaceBridge.js` | the link to the Revit add-in and the Sportify folder |

## License

[MIT](LICENSE)
