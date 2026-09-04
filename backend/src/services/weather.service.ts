import { HttpError } from '../middleware/error';

// Open-Meteo is fast; ten seconds without an answer means it is down, and
// the request should fail (the error middleware says "the stylist is out")
// rather than hang.
const FETCH_TIMEOUT_MS = 10_000;

export interface Weather {
  location: string;
  temperatureC: number;
  description: string;
  /** The day's range from the forecast, when the brief was composed from it. */
  highC?: number;
  lowC?: number;
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

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new HttpError(502, 'Weather lookup failed (geocoding)');
  const data = (await res.json()) as { results?: GeoResult[] };
  const hit = data.results?.[0];
  if (!hit) throw new HttpError(400, `Couldn't find a location named "${location}"`);
  return hit;
}

export async function getWeather(location: string): Promise<Weather> {
  const place = await geocode(location);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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

export interface ForecastDay {
  date: string;
  minC: number;
  maxC: number;
  description: string;
  rainChance: boolean;
}

export interface TripForecast {
  location: string;
  days: ForecastDay[];
  // True when part (or all) of the trip is beyond the forecast horizon
  // (~16 days) — the packer then leans on the season instead.
  partial: boolean;
}

// Daily forecast for a date range, clipped to Open-Meteo's ~16-day horizon.
export async function getTripForecast(
  location: string,
  startDate: string,
  endDate: string,
): Promise<TripForecast> {
  const place = await geocode(location);

  const horizon = new Date(Date.now() + 15 * 86_400_000);
  const clampedEnd = new Date(endDate) > horizon ? horizon.toISOString().slice(0, 10) : endDate;
  const partial = clampedEnd !== endDate;
  const start = new Date(startDate) > horizon ? null : startDate;

  let days: ForecastDay[] = [];
  if (start) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
      `&start_date=${start}&end_date=${clampedEnd}&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new HttpError(502, 'Weather lookup failed (forecast)');
    const data = (await res.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        weather_code?: number[];
      };
    };
    const d = data.daily;
    days = (d?.time ?? []).map((date, i) => ({
      date,
      minC: Math.round(d?.temperature_2m_min?.[i] ?? 0),
      maxC: Math.round(d?.temperature_2m_max?.[i] ?? 0),
      description: WEATHER_CODES[d?.weather_code?.[i] ?? -1] ?? 'unknown conditions',
      rainChance: (d?.precipitation_probability_max?.[i] ?? 0) >= 40,
    }));
  }

  return {
    location: [place.name, place.country].filter(Boolean).join(', '),
    days,
    partial: partial || !start,
  };
}
