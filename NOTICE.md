# Third-party credits & data licenses

This project's own source code is MIT-licensed (see `LICENSE`). It builds on
the following third-party work, each under its own license:

## Inspiration

- **[jeantimex/tokyo](https://github.com/jeantimex/tokyo)** ([live demo](https://jeantimex.github.io/tokyo/))
  by [@jeantimex](https://github.com/jeantimex) — a real-time 3D Tokyo built
  on Japan's PLATEAU building dataset. This project borrows the *idea*
  (a real-time, browser-based 3D city built from open map data) and the
  general day/night, orbit-camera presentation style, but **no code or
  assets were copied**. There is no PLATEAU-equivalent government 3D
  building dataset for Indian cities, so this project's data pipeline,
  rendering code, and building-extrusion logic were written from scratch
  against OpenStreetMap data. If you reuse or fork this repo, please still
  credit jeantimex/tokyo as the inspiration, per their own MIT license terms
  for their code.

## Map data

- **© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors**,
  licensed under the **[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)**.
  Building footprints, heights (`height` / `building:levels` tags), roads,
  water bodies, rivers/creeks, and parks for South Mumbai (Fort–Marine
  Lines–Dadar) were queried via the
  [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (via the
  `lz4.overpass-api.de` endpoint) on 2026-10-10 and pre-processed into
  `data/city-data.json`.
  - ODbL requires attribution (included in the app's on-screen credit and
    here) and that any **produced work using the database as a whole**
    remain available under ODbL, or that you share any adapted version of
    the database itself under ODbL. The *rendering code* is a separate,
    independently-licensed work (MIT) — only the data file
    (`data/city-data.json`) carries the ODbL obligation.
  - If you edit or redistribute `data/city-data.json` itself, keep this
    attribution and the ODbL terms attached to it.

## Libraries

- **[Three.js](https://threejs.org/)** — MIT License, Copyright © three.js
  authors. Loaded at runtime from the [jsDelivr](https://www.jsdelivr.com/)
  CDN; not vendored in this repo.

## Summary

| Component | License | Source |
|---|---|---|
| This repo's code (`src/`, `index.html`, build scripts) | MIT | This repository |
| `data/city-data.json` | ODbL 1.0 | © OpenStreetMap contributors |
| Three.js (loaded via CDN) | MIT | https://github.com/mrdoob/three.js |
| Design inspiration | — | https://github.com/jeantimex/tokyo (MIT, no code reused) |
