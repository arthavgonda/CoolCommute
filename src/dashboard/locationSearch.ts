import type { Place } from '../data/profile';

export type LocationResult = { place: Place; label: string };

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

type GeocodingResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: { full_address?: string; name?: string; name_preferred?: string; place_formatted?: string };
    place_name?: string;
  }>;
};

type ReverseGeocodingResponse = {
  features?: Array<{
    properties?: {
      name_preferred?: string;
      name?: string;
      full_address?: string;
      place_formatted?: string;
      feature_type?: string;
    };
    place_name?: string;
  }>;
};

export const reverseGeocodeLocation = async (lat: number, lng: number): Promise<string | null> => {
  if (!TOKEN || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: TOKEN,
    language: 'en',
    types: 'neighborhood,locality,place,district,region',
    limit: '1',
  });
  try {
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`);
    if (!response.ok) return null;
    const result = await response.json() as ReverseGeocodingResponse;
    const properties = result.features?.[0]?.properties;
    return properties?.name_preferred || properties?.name || properties?.place_formatted || properties?.full_address || result.features?.[0]?.place_name || null;
  } catch {
    return null;
  }
};

export type LocationSearchOptions = {
  proximity?: Place;
  bbox?: [number, number, number, number];
};

export const searchLocations = async (query: string, limit = 6, autocomplete = true, options: LocationSearchOptions = {}): Promise<LocationResult[]> => {
  const normalized = query.trim();
  if (!normalized) throw new Error('Enter a city or neighborhood to search.');
  if (!TOKEN) throw new Error('Add your public Mapbox token to EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to search places.');
  if (normalized.length > 256) throw new Error('Keep your place search under 256 characters.');
  if (normalized.includes(';')) throw new Error('Remove semicolons from the place search.');

  const params = new URLSearchParams({
    q: normalized,
    access_token: TOKEN,
    auto_complete: String(autocomplete),
    limit: String(limit),
    language: 'en',
    types: 'poi,address,street,neighborhood,locality,place,city,category',
  });
  if (options.proximity && Number.isFinite(options.proximity.lng) && Number.isFinite(options.proximity.lat)) {
    params.set('proximity', `${options.proximity.lng},${options.proximity.lat}`);
  }
  if (options.bbox?.every(Number.isFinite)) params.set('bbox', options.bbox.join(','));
  const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Mapbox rejected this search. Check that Search Box API access is enabled for the token.');
    throw new Error('Place search is temporarily unavailable. Try again shortly.');
  }
  const result = await response.json() as GeocodingResponse;
  return (result.features ?? []).flatMap(feature => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
    return [{
      place: { lat: coordinates[1], lng: coordinates[0] },
      label: feature.properties?.full_address || feature.properties?.place_formatted || feature.place_name || feature.properties?.name_preferred || feature.properties?.name || normalized,
    }];
  });
};

export const searchLocation = async (query: string, proximity?: Place): Promise<LocationResult> => {
  const result = (await searchLocations(query, 1, true, { proximity }))[0];
  if (!result) throw new Error('No matching place was found. Try a nearby city or neighborhood.');
  return result;
};
