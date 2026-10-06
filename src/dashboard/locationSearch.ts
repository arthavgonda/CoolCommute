import type { Place } from '../data/profile';

export type LocationResult = { place: Place; label: string };

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

type GeocodingResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: { full_address?: string; name?: string };
    place_name?: string;
  }>;
};

export const searchLocations = async (query: string, limit = 5, autocomplete = true): Promise<LocationResult[]> => {
  const normalized = query.trim();
  if (!normalized) throw new Error('Enter a city or neighborhood to search.');
  if (!TOKEN) throw new Error('Add your public Mapbox token to EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to search places.');
  if (normalized.length > 256) throw new Error('Keep your place search under 256 characters.');
  if (normalized.includes(';')) throw new Error('Remove semicolons from the place search.');

  const params = new URLSearchParams({ q: normalized, access_token: TOKEN, autocomplete: String(autocomplete), limit: String(limit), language: 'en' });
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Mapbox rejected this search. Check the Mapbox token and geocoding access.');
    throw new Error('Place search is temporarily unavailable. Try again shortly.');
  }
  const result = await response.json() as GeocodingResponse;
  return (result.features ?? []).flatMap(feature => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
    return [{
      place: { lat: coordinates[1], lng: coordinates[0] },
      label: feature.properties?.full_address || feature.place_name || feature.properties?.name || normalized,
    }];
  });
};

export const searchLocation = async (query: string): Promise<LocationResult> => {
  const result = (await searchLocations(query, 1, false))[0];
  if (!result) throw new Error('No matching place was found. Try a nearby city or neighborhood.');
  return result;
};
