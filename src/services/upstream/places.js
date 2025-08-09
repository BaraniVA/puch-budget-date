import { httpJson } from '../../lib/http.js';

const DEFAULT_QUERIES = [
  'node(around:3000,{LAT},{LON})[amenity=cafe];',
  'node(around:3000,{LAT},{LON})[leisure=park];',
  'node(around:3000,{LAT},{LON})[tourism=museum];',
  'node(around:3000,{LAT},{LON})[amenity=restaurant];',
  'node(around:3000,{LAT},{LON})[amenity=ice_cream];',
  'node(around:3000,{LAT},{LON})[amenity=pub];',
];

const KEYWORD_MAP = {
  coffee: 'node(around:3000,{LAT},{LON})[amenity=cafe];',
  cafe: 'node(around:3000,{LAT},{LON})[amenity=cafe];',
  art: 'node(around:3000,{LAT},{LON})[tourism=gallery];',
  museum: 'node(around:3000,{LAT},{LON})[tourism=museum];',
  music: 'node(around:3000,{LAT},{LON})[amenity=music_venue];',
  park: 'node(around:3000,{LAT},{LON})[leisure=park];',
  cinema: 'node(around:3000,{LAT},{LON})[amenity=cinema];',
  restaurant: 'node(around:3000,{LAT},{LON})[amenity=restaurant];',
  bar: 'node(around:3000,{LAT},{LON})[amenity=bar];',
};

function buildOverpassQuery(lat, lon, preferences, spin) {
  const latStr = String(lat);
  const lonStr = String(lon);
  const tokens = (preferences || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  let parts = [];
  if (spin || tokens.length === 0) {
    parts = DEFAULT_QUERIES;
  } else {
    parts = tokens.map((t) => KEYWORD_MAP[t]).filter(Boolean);
    if (parts.length === 0) parts = DEFAULT_QUERIES;
  }

  const body = `[
    out:json
  ];
  (
    ${parts.join('\n    ')}
  );
  out center;`;
  return body.replaceAll('{LAT}', latStr).replaceAll('{LON}', lonStr);
}

export async function findPlaces(lat, lon, preferences, spin = false) {
  const q = buildOverpassQuery(lat, lon, preferences, spin);
  const url = 'https://overpass-api.de/api/interpreter';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': 'BudgetDate/1.0 (+https://puch.ai)',
    },
    body: new URLSearchParams({ data: q }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Overpass HTTP ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const items = (data.elements || [])
    .map((e) => ({
      id: e.id,
      name: e.tags?.name,
      type: e.tags?.amenity || e.tags?.tourism || e.tags?.leisure,
      lat: e.lat || e.center?.lat,
      lon: e.lon || e.center?.lon,
    }))
    .filter((x) => x.name && x.lat && x.lon);

  // dedupe by name
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = it.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  // randomize
  for (let i = deduped.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deduped[i], deduped[j]] = [deduped[j], deduped[i]];
  }

  // take up to 20 places for prompt
  return deduped.slice(0, 20);
}
