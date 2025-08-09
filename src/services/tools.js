import { z } from 'zod';
import { geocodeCity } from './upstream/geocode.js';
import { getWeather } from './upstream/weather.js';
import { findPlaces } from './upstream/places.js';
import { generateItinerary } from './upstream/gemini.js';

const BudgetArgs = z.object({
  budget: z.number().positive(),
  city: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  preferences: z.string().optional(),
  spin: z.boolean().optional(),
});

function parseTokenMap(envStr) {
  if (!envStr) return new Map();
  const map = new Map();
  for (const pair of envStr.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [token, phone] = pair.split(':');
    if (!token || !phone) continue;
    map.set(token.trim(), String(phone).trim());
  }
  return map;
}

function normalizePhone(phone) {
  // Puch expects digits only without '+'
  const digits = String(phone).replace(/\D/g, '');
  return digits;
}

export async function validateTool(args) {
  const schema = z.object({ token: z.string().min(1) });
  const { token } = schema.parse(args);

  const tokenMap = parseTokenMap(process.env.VALIDATE_TOKEN_MAP);
  let phone = tokenMap.get(token);
  if (!phone) {
    // fallback to OWNER_PHONE for single-owner setups
    phone = process.env.OWNER_PHONE;
  }
  if (!phone) {
    const err = new Error('Unauthorized: token not recognized and OWNER_PHONE not set');
    err.status = 401;
    throw err;
  }
  const normalized = normalizePhone(phone);
  if (!normalized) {
    const err = new Error('Invalid phone mapping');
    err.status = 400;
    throw err;
  }
  return normalized;
}

export async function budgetDateTool(args) {
  const input = BudgetArgs.parse(args);
  let lat = input.latitude;
  let lon = input.longitude;
  let city = input.city;

  if ((!lat || !lon) && city) {
    const geo = await geocodeCity(city);
    if (!geo) {
      const err = new Error('Could not find city');
      err.status = 400;
      throw err;
    }
    lat = Number(geo.lat);
    lon = Number(geo.lon);
    city = geo.display_name?.split(',')[0] || city;
    await new Promise(r => setTimeout(r, 1200)); // respect Nominatim throttle
  }

  if (lat == null || lon == null) {
    const err = new Error('latitude/longitude or city is required');
    err.status = 400;
    throw err;
  }

  const weather = await getWeather(lat, lon);
  const places = await findPlaces(lat, lon, input.preferences, input.spin);

  const plan = await generateItinerary({
    budget: input.budget,
    city: city || `${lat.toFixed(3)},${lon.toFixed(3)}`,
    weather,
    preferences: input.preferences || '',
    places,
  });

  return plan;
}
