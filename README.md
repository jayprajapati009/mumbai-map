# Procedural Mumbai

A real-time, browser-based 3D view of South Mumbai (Fort–Marine
Lines–Dadar) — buildings extruded from their real footprints, roads,
creeks, and parks — rendered with [Three.js](https://threejs.org/), with a
day/night toggle and glowing window lights at night.

**Live demo: https://jayprajapati009.github.io/mumbai-map/**

No build step, no backend — it's a static page that fetches a pre-processed
JSON file and renders it with WebGL.

## Credits & inspiration

This project is **inspired by** [jeantimex/tokyo](https://github.com/jeantimex/tokyo)
([live demo](https://jeantimex.github.io/tokyo/)) — a stunning real-time 3D
Tokyo built on Japan's PLATEAU government building dataset, with traffic,
trains, and volumetric clouds. Huge credit to [@jeantimex](https://github.com/jeantimex)
for that project; go look at it.

**This repo does not reuse any of that project's code or assets.** There is
no PLATEAU-equivalent open 3D building dataset for Indian cities, so instead
this project is built entirely from **[OpenStreetMap](https://www.openstreetmap.org/)**
2D building footprints, extruded using each building's `height` or
`building:levels` tag (falling back to a footprint-size-based estimate where
neither is tagged). That's a much simpler pipeline than Tokyo's — no
terrain, no traffic/train simulation, no PLATEAU LOD2 meshes — scoped to
what's actually available for this city.

This is a sibling project to [`ahmedabad-map`](https://github.com/jayprajapati009/ahmedabad-map),
built from the same renderer — only the data differs.

Full attribution and license details for every data source and library used
are in **[NOTICE.md](./NOTICE.md)**. Short version:

| What | License | Credit |
|---|---|---|
| This repo's code | MIT | Jay Prajapati |
| `data/city-data.json` | ODbL 1.0 | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors |
| Three.js (via CDN) | MIT | [mrdoob/three.js](https://github.com/mrdoob/three.js) |
| Concept/inspiration | — | [jeantimex/tokyo](https://github.com/jeantimex/tokyo) (MIT, no code reused) |

If you fork this, please keep the OpenStreetMap attribution visible in the
UI (ODbL requires it) and keep crediting jeantimex/tokyo as the inspiration.

## How it works

1. **`tools/query.overpass`** — an [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
   query selecting buildings, roads, water, and parks in a bounding box over
   South Mumbai.
2. **`tools/fetch-data.sh`** — downloads that query's result as
   `tools/raw-overpass.json` (not committed — tens of MB of raw OSM JSON).
3. **`tools/build-data.js`** — projects lon/lat to local meters (equirectangular,
   centered on the city), estimates building heights, correctly distinguishes
   closed water *areas* (lakes/ponds/creeks) from open `waterway` *lines*
   (rivers/canals — rendered as a ribbon, not filled), and writes the compact
   `data/city-data.json` actually shipped to the browser.
4. **`src/main.js`** — fetches `city-data.json`, extrudes every building
   footprint into a single merged `BufferGeometry`, builds flat meshes for
   roads/water/parks, scatters instanced "window light" quads on tall
   buildings for the night view, and renders it all with Three.js +
   `OrbitControls` + `UnrealBloomPass`.

## Running locally

No install needed — it's static files plus a CDN import map.

```bash
cd mumbai-map
python3 -m http.server 8080
# then open http://localhost:8080
```

## Regenerating the data

```bash
cd tools
./fetch-data.sh      # downloads raw-overpass.json from the Overpass API
node build-data.js   # writes ../data/city-data.json
```

## Deploying

This is a plain static site, so it works as-is on GitHub Pages: push to a
repo and enable Pages for the root of the default branch (or `/docs`).

## License

MIT for the code — see [LICENSE](./LICENSE). Map data is ODbL — see
[NOTICE.md](./NOTICE.md).
