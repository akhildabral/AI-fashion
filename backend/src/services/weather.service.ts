import { HttpError } from '../middleware/error';

export interface Weather {
  location: string;
  temperatureC: number;
  description: string;
}

// WMO weather interpretation codes → short descriptions.
const WEATHER_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'rime fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'rain showers',
  81: 'rain showers',
  82: 'violent rain showers',
  85: 'snow showers',
  86: 'snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',
  99: 'thunderstorm with hail',
};

interface GeoResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

async function geocode(location: string): Promise<GeoResult> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    location,
  )}&count=1&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new HttpError(502, 'Weather lookup failed (geocoding)');
  const data = (await res.json()) as { results?: GeoResult[] };
  const hit = data.results?.[0];
  if (!hit) throw new HttpError(400, `Couldn't find a location named "${location}"`);
  return hit;
}

export async function getWeather(location: string): Promise<Weather> {
  const place = await geocode(location);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code`;
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(502, 'Weather lookup failed (forecast)');
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };

  const temp = data.current?.temperature_2m;
  const code = data.current?.weather_code;
  if (temp === undefined) throw new HttpError(502, 'Weather data unavailable');

  return {
    location: [place.name, place.country].filter(Boolean).join(', '),
    temperatureC: Math.round(temp),
    description: code !== undefined ? (WEATHER_CODES[code] ?? 'unknown conditions') : 'unknown conditions',
  };
}
