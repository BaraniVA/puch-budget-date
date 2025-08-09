import { httpJson } from '../../lib/http.js';

export async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&format=json&limit=1`;
  const data = await httpJson(url);
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}
