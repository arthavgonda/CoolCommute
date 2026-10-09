import type { Place } from '../data/profile';

const ROUTES_URL = process.env.EXPO_PUBLIC_ROUTES_URL ?? '';
const ROUTES_KEY = process.env.EXPO_PUBLIC_ROUTES_KEY ?? '';
export const ROUTE_SERVICE_AREA_BBOX: [number, number, number, number] = [76.8, 28.35, 77.5, 28.95];
export const isInsideRouteServiceArea = ({ lat, lng }: Place) => (
  lng >= ROUTE_SERVICE_AREA_BBOX[0] && lng <= ROUTE_SERVICE_AREA_BBOX[2]
  && lat >= ROUTE_SERVICE_AREA_BBOX[1] && lat <= ROUTE_SERVICE_AREA_BBOX[3]
);

export type RouteMode = 'walking' | 'bus' | 'metro';
export const ROUTE_MODE_COLORS: Record<RouteMode, string> = {
  walking: '#6FA8FF',
  bus: '#E8B85C',
  metro: '#4CC9A6',
};

export const getRouteLegMode = (modeValue: string): RouteMode => {
  const mode = modeValue.toLowerCase();
  if (mode.includes('bus')) return 'bus';
  if (mode.includes('metro') || mode.includes('subway') || mode.includes('train') || mode.includes('rail')) return 'metro';
  return 'walking';
};

export type RouteOption = {
  id: string;
  durationSeconds: number;
  distanceMeters: number;
  startTime: string | null;
  endTime: string | null;
  legs: Array<{
    mode: string;
    line: string | null;
    durationSeconds: number;
    distanceMeters: number;
    from: string;
    to: string;
    startTime: string | null;
    endTime: string | null;
    coordinates: [number, number][];
  }>;
  coordinates: [number, number][];
  label: string;
  score: number | null;
  totalFromNowMin: number | null;
  waitMin: number;
  transfers: number;
  exposureMin: number | null;
  walkPm25: number | null;
  tags: string[];
};

export type RouteAdviceWait = {
  recommended: boolean;
  reason?: string;
  waitMin?: number;
  departAt?: string;
  expectedExposureReductionPct?: number;
  forecastChangePct?: number;
  basis?: string;
};

export type FallbackRide = {
  kind: string;
  pickup: { lat: number; lon: number; name: string };
  totalFromNowMin: number;
  rideMin: number;
  rideKm: number;
  exposureMin: number;
  legs: Array<{ mode: string; from: string; to: string; minutes: number; distanceM: number; points: string; pm25: number; band: string; exposureMin: number }>;
  vsBest?: { exposureReductionPct: number; timeSavedMin: number };
  worthIt: boolean;
};

export type RouteAdvice = {
  level: 'ok' | 'elevated' | 'high' | string;
  noTransit: boolean;
  reasons: string[];
  wait: RouteAdviceWait | null;
  rides: FallbackRide[];
};

export type RideFareRange = { min: number; max: number } | null;
export type RideQuote = {
  fromText: string;
  toText: string;
  bike: RideFareRange;
  cabEconomy: RideFareRange;
  cabPremium: RideFareRange;
  cabXl: RideFareRange;
  url: string | null;
  note?: string;
};

export type ScoredRoutesResult = { routes: RouteOption[]; advice: RouteAdvice };

export type RouteModeMarker = {
  id: string;
  mode: RouteMode;
  line: string | null;
  from: string;
  to: string;
  coordinate: [number, number];
};

const distanceMeters = (first: [number, number], second: [number, number]) => {
  const radians = Math.PI / 180;
  const lat1 = first[1] * radians;
  const lat2 = second[1] * radians;
  const dLat = (second[1] - first[1]) * radians;
  const dLng = (second[0] - first[0]) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const pointAlongPath = (coordinates: [number, number][], fraction: number): [number, number] | null => {
  if (coordinates.length < 2) return null;
  const segmentLengths = coordinates.slice(1).map((point, index) => distanceMeters(coordinates[index], point));
  const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0);
  if (totalLength <= 0) return coordinates[0];
  let remaining = totalLength * fraction;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (remaining <= segmentLength || index === segmentLengths.length - 1) {
      const ratio = segmentLength > 0 ? Math.min(1, remaining / segmentLength) : 0;
      const start = coordinates[index];
      const end = coordinates[index + 1];
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    }
    remaining -= segmentLength;
  }
  return coordinates[coordinates.length - 1];
};

/** Place one mode animation on each leg where space allows, keeping icons apart. */
export const getRouteModeMarkers = (route: RouteOption): RouteModeMarker[] => {
  const routeLength = route.coordinates.slice(1).reduce((sum, point, index) => sum + distanceMeters(route.coordinates[index], point), 0);
  const minSeparation = Math.max(200, Math.min(900, routeLength * 0.05));
  const placed: RouteModeMarker[] = [];

  route.legs.forEach((leg, index) => {
    const mode = getRouteLegMode(leg.mode);
    const candidates = [0.35, 0.5, 0.65]
      .map(fraction => pointAlongPath(leg.coordinates, fraction))
      .filter((coordinate): coordinate is [number, number] => coordinate !== null);
    let best: [number, number] | null = null;
    let bestDistance = -1;
    for (const candidate of candidates) {
      const closest = placed.length
        ? Math.min(...placed.map(marker => distanceMeters(candidate, marker.coordinate)))
        : Number.POSITIVE_INFINITY;
      if (closest > bestDistance) {
        best = candidate;
        bestDistance = closest;
      }
    }
    if (!best || bestDistance < minSeparation) return;
    placed.push({ id: `${route.id}-mode-${index}`, mode, line: leg.line, from: leg.from, to: leg.to, coordinate: best });
  });

  return placed;
};

type ScoredLeg = {
  mode?: string;
  line?: string | null;
  from?: string;
  to?: string;
  minutes?: number;
  distanceM?: number;
  points?: string | unknown[];
  pm25?: number;
  band?: string;
  exposureMin?: number;
  startTime?: string;
  endTime?: string;
};

type ScoredRoute = {
  variant?: string;
  durationMin?: number;
  totalFromNowMin?: number;
  walkMin?: number;
  waitMin?: number;
  transfers?: number;
  exposureMin?: number;
  walkPm25?: number;
  score?: number;
  legs?: ScoredLeg[];
  tags?: string[];
  startTime?: string;
  endTime?: string;
};

type ScoredRoutesResponse = { routes?: ScoredRoute[]; advice?: RouteAdvice; message?: string; error?: string };

const decodePolyline = (encoded: string): [number, number][] => {
  const points: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return [];
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) return [];
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([longitude / 1e5, latitude / 1e5]);
  }
  return points;
};

const normalizePoints = (value: unknown): [number, number][] => {
  if (typeof value === 'string') {
    try {
      return normalizePoints(JSON.parse(value) as unknown);
    } catch {
      return decodePolyline(value);
    }
  }
  if (!Array.isArray(value)) return [];
  if (value.length && typeof value[0] === 'number') {
    const flat = value as number[];
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const a = flat[i];
      const b = flat[i + 1];
      if (Number.isFinite(a) && Number.isFinite(b)) points.push([a, b]);
    }
    return points;
  }
  return value.flatMap((point): [number, number][] => {
    if (Array.isArray(point) && point.length >= 2) {
      const [first, second] = point;
      return typeof first === 'number' && typeof second === 'number' ? [[first, second]] : [];
    }
    if (point && typeof point === 'object') {
      const item = point as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown };
      const lat = typeof item.latitude === 'number' ? item.latitude : item.lat;
      const lng = typeof item.longitude === 'number' ? item.longitude : item.lng;
      return typeof lat === 'number' && typeof lng === 'number' ? [[lng, lat]] : [];
    }
    return [];
  });
};

export const getScoredRoutes = async (from: Place, to: Place, signal?: AbortSignal): Promise<ScoredRoutesResult> => {
  if (!ROUTES_URL) throw new Error('Route scoring is not configured. Set EXPO_PUBLIC_ROUTES_URL and restart the app.');
  if (!ROUTES_KEY) throw new Error('Route scoring key is not configured. Set EXPO_PUBLIC_ROUTES_KEY and restart the app.');
  if (__DEV__) console.log('[Routes API] Request starting', { endpoint: ROUTES_URL, origin: from, destination: to, priority: 'balanced' });
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-cc-key': ROUTES_KEY },
      body: JSON.stringify({
        from: { lat: from.lat, lon: from.lng },
        to: { lat: to.lat, lon: to.lng },
        priority: 'balanced',
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (__DEV__) console.error('[Routes API] Network request failed', error);
    throw new Error('Could not connect to the route service. Check your connection and try again.');
  }
  if (__DEV__) console.log('[Routes API] HTTP response', { status: response.status, elapsedMs: Date.now() - startedAt });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (__DEV__) console.error('[Routes API] Non-success response', { status: response.status, statusText: response.statusText, body });
    throw new Error(`Route service returned ${response.status}.`);
  }

  const payload = await response.json() as ScoredRoutesResponse;
  const sourceRoutes = payload.routes ?? [];
  if (!sourceRoutes.length) {
    if (__DEV__) console.warn('[Routes API] No routes returned', { message: payload.message, error: payload.error });
    throw new Error(payload.message || payload.error || 'No transit routes were found for this trip.');
  }

  const routes = sourceRoutes.map((source, index) => {
    const legs = (source.legs ?? []).map(leg => {
      const coordinates = normalizePoints(leg.points);
      return {
        mode: (leg.mode || 'foot').toLowerCase(),
        line: leg.line || null,
        durationSeconds: Math.max(0, (leg.minutes ?? 0) * 60),
        distanceMeters: Math.max(0, leg.distanceM ?? 0),
        from: leg.from || '',
        to: leg.to || '',
        startTime: leg.startTime || null,
        endTime: leg.endTime || null,
        coordinates,
      };
    });
    const coordinates = legs.flatMap((leg, legIndex) => leg.coordinates.slice(legIndex ? 1 : 0));
    const modes = [...new Set(legs.map(leg => getRouteLegMode(leg.mode)))];
    const label = modes.map(mode => mode === 'walking' ? 'Walk' : mode === 'metro' ? 'Metro' : 'Bus').join(' + ') || 'Transit';
    return {
      id: `scored-route-${index}-${source.variant || 'route'}`,
      durationSeconds: Math.max(0, (source.durationMin ?? legs.reduce((sum, leg) => sum + leg.durationSeconds / 60, 0)) * 60),
      distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
      startTime: source.startTime || legs.find(leg => leg.startTime)?.startTime || null,
      endTime: source.endTime || [...legs].reverse().find(leg => leg.endTime)?.endTime || null,
      legs,
      coordinates,
      label,
      score: typeof source.score === 'number' ? source.score : null,
      totalFromNowMin: typeof source.totalFromNowMin === 'number' ? source.totalFromNowMin : null,
      waitMin: source.waitMin ?? 0,
      transfers: source.transfers ?? 0,
      exposureMin: typeof source.exposureMin === 'number' ? source.exposureMin : null,
      walkPm25: typeof source.walkPm25 === 'number' ? source.walkPm25 : null,
      tags: source.tags ?? [],
    };
  }).filter(route => route.coordinates.length >= 2);
  if (__DEV__) console.log('[Routes API] Parsed scored routes', {
    elapsedMs: Date.now() - startedAt,
    returnedRoutes: sourceRoutes.length,
    drawableRoutes: routes.length,
    routes: routes.map((route, index) => ({
      index,
      mode: route.label,
      durationMinutes: Math.round(route.durationSeconds / 60),
      distanceMeters: Math.round(route.distanceMeters),
      score: route.score,
      tags: route.tags,
      legCount: route.legs.length,
      pointCount: route.coordinates.length,
    })),
  });
  return { routes, advice: payload.advice ?? { level: 'ok', noTransit: false, reasons: [], wait: null, rides: [] } };
};

export const getRideQuote = async (from: Place, to: Place, signal?: AbortSignal): Promise<RideQuote> => {
  const quoteUrl = ROUTES_URL.replace(/\/routes\/?$/, '/ride-quote');
  if (!quoteUrl || quoteUrl === ROUTES_URL) throw new Error('Rapido fare quotes are not configured on the route service.');
  const startedAt = Date.now();
  if (__DEV__) console.log('[Ride quote] Request starting', { endpoint: quoteUrl, from, to });
  let response: Response;
  try {
    response = await fetch(quoteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-cc-key': ROUTES_KEY },
      body: JSON.stringify({ from: { lat: from.lat, lon: from.lng }, to: { lat: to.lat, lon: to.lng } }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (__DEV__) console.error('[Ride quote] Network request failed', error);
    throw new Error('Could not retrieve Rapido fare estimates.');
  }
  if (__DEV__) console.log('[Ride quote] HTTP response', { status: response.status, elapsedMs: Date.now() - startedAt });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (__DEV__) console.error('[Ride quote] Non-success response', { status: response.status, body });
    throw new Error(`Rapido fare service returned ${response.status}.`);
  }
  return await response.json() as RideQuote;
};
