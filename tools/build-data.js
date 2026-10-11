// Processes a raw Overpass API JSON dump (see fetch-data.sh / query.overpass)
// into the compact, projected city-data.json consumed by src/main.js.
//
// Usage:
//   ./tools/fetch-data.sh          # downloads tools/raw-overpass.json
//   node tools/build-data.js       # writes data/city-data.json
const fs = require('fs');
const path = require('path');

const rawPath = path.join(__dirname, 'raw-overpass.json');
if (!fs.existsSync(rawPath)) {
  console.error('Missing tools/raw-overpass.json — run ./tools/fetch-data.sh first.');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

const nodes = new Map();
const ways = [];
for (const el of raw.elements) {
  if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
  else if (el.type === 'way') ways.push(el);
}

// Center on Mumbai, spanning South Mumbai (Fort/Colaba/Marine Lines) north
// through Worli, Lower Parel, Bandra and BKC — covers the modern high-rise
// skyline and the Coastal Road, not just the old colonial-era core.
const LAT0 = 18.985;
const LON0 = 72.835;
const R = 6378137;
const DEG = Math.PI / 180;
const cosLat0 = Math.cos(LAT0 * DEG);

function project(lon, lat) {
  const x = (lon - LON0) * DEG * R * cosLat0;
  const y = (lat - LAT0) * DEG * R; // north = +y, will map to -z in three.js (north = -z typically)
  return [x, y];
}

function wayCoords(w) {
  const pts = [];
  for (const id of w.nodes) {
    const n = nodes.get(id);
    if (!n) return null;
    pts.push(project(n[0], n[1]));
  }
  return pts;
}

function isClosed(pts) {
  if (pts.length < 3) return false;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

// Shoelace area (for filtering degenerate polygons), unsigned
function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  return Math.abs(s) / 2;
}

const buildings = [];
const roads = [];
const water = [];
const waterways = [];
const parks = [];

const waterwayWidth = {
  river: 22, canal: 10, stream: 3.5, drain: 2, ditch: 1.5,
};

const roadClassWidth = {
  motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 7.5,
  residential: 6, unclassified: 5.5, service: 3.5, living_street: 5,
  pedestrian: 4, footway: 2, path: 1.5, track: 3, cycleway: 2,
  motorway_link: 8, trunk_link: 8, primary_link: 7, secondary_link: 6, tertiary_link: 5,
};

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
function trackBounds(pts) {
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}

for (const w of ways) {
  const tags = w.tags || {};
  const pts = wayCoords(w);
  if (!pts || pts.length < 2) continue;

  if (tags.building) {
    if (!isClosed(pts) || pts.length < 4) continue;
    if (area(pts) < 4) continue; // skip tiny slivers (<4 sq m)
    let height = null;
    if (tags.height) {
      height = parseFloat(tags.height);
    } else if (tags['building:levels']) {
      height = parseFloat(tags['building:levels']) * 3.2;
    }
    if (!Number.isFinite(height) || height <= 0) {
      // vary default height a bit by footprint size for visual variety
      const a = area(pts);
      height = 7 + Math.min(18, Math.sqrt(a) * 0.9);
    }
    // 120m suited Ahmedabad/Vadodara's mid-rise skyline but flattens Mumbai's
    // actual supertalls (Palais Royale ~320m, World One ~280m+); cap high
    // enough to preserve that variation without trusting a wildly bad tag.
    height = Math.min(height, 420);
    trackBounds(pts);
    buildings.push({ h: Math.round(height * 10) / 10, pts: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) });
  } else if (tags.highway) {
    const cls = tags.highway;
    if (['proposed', 'construction', 'raceway', 'corridor', 'steps'].includes(cls)) continue;
    const width = roadClassWidth[cls] || 4;
    trackBounds(pts);
    roads.push({ c: cls, w: width, pts: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) });
  } else if (tags.natural === 'water' || tags.waterway === 'riverbank') {
    // These are genuine area features (lake/pond/riverbank polygons).
    // A `waterway` LINE (river/stream/canal centerline — see below) is NOT
    // an area and must never be filled as one, or a long meandering river
    // centerline turns into one giant blob covering everything it crosses.
    if (pts.length < 3 || !isClosed(pts)) continue;
    trackBounds(pts);
    water.push({ pts: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) });
  } else if (tags.waterway) {
    // River/stream/canal/drain centerlines: linear features, rendered as a
    // ribbon (like roads), not filled shapes.
    if (pts.length < 2) continue;
    const width = waterwayWidth[tags.waterway] || 3;
    trackBounds(pts);
    waterways.push({ w: width, pts: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) });
  } else if (tags.leisure === 'park' || tags.landuse === 'grass') {
    if (pts.length < 3) continue;
    trackBounds(pts);
    parks.push({ pts: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) });
  }
}

console.log('buildings:', buildings.length, 'roads:', roads.length, 'water:', water.length, 'waterways:', waterways.length, 'parks:', parks.length);
console.log('bounds x:', minX.toFixed(0), maxX.toFixed(0), 'y:', minY.toFixed(0), maxY.toFixed(0));

const areaKm2 = ((maxX - minX) * (maxY - minY)) / 1e6;
console.log('buildings per km^2 (bbox, not builtup-area-adjusted):', (buildings.length / areaKm2).toFixed(0));

const out = {
  center: { lat: LAT0, lon: LON0 },
  bounds: { minX, maxX, minY, maxY },
  buildings, roads, water, waterways, parks,
};

const outPath = path.join(__dirname, '..', 'data', 'city-data.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('wrote', outPath, 'size MB:', (fs.statSync(outPath).size / 1e6).toFixed(2));
