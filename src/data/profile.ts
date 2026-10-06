import { readJson, removeJson, writeJson } from './localStore';
import { Platform } from 'react-native';
import { getCurrentUsername } from '../auth/cognito';
export type Level = 'low' | 'medium' | 'high';
export type Tradeoff = 'time' | 'exposure' | 'balanced';
export type Place = { lat: number; lng: number };
export type Profile = {
  airSensitivity?: Level;
  heatAvoidance?: Level;
  tradeoff?: Tradeoff;
  location?: Place | null;
  locationLabel?: string;
  locationAccuracy?: number | null;
  completedAt?: string;
  synced?: boolean;
};
const storageKey = () => {
  const identity = `${process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? 'default'}:${getCurrentUsername()?.trim().toLowerCase() || 'guest'}`;
  let hashA = 2166136261;
  let hashB = 2246822519;
  for (let index = 0; index < identity.length; index += 1) {
    const character = identity.charCodeAt(index);
    hashA = Math.imul(hashA ^ character, 16777619);
    hashB = Math.imul(hashB ^ character, 3266489917);
  }
  return `profile-${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`;
};
export const loadProfile = () => readJson<Profile>(storageKey());
export const saveProfile = (p: Profile) => writeJson(storageKey(), p);
export const removeProfile = async () => {
  await Promise.all([removeJson(storageKey()), removeJson('profile')]);
};
const API = process.env.EXPO_PUBLIC_API_URL;
const call = async (method: string, token: string | null, body?: Profile) => {
  const url = API ? `${API.replace(/\/+$/, '')}/profile` : null;
  if (!url || !token) {
    throw new Error('Profile sync is not configured. Check the API URL and sign-in session.');
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(Platform.OS === 'web'
      ? 'Could not reach the profile API. Check API Gateway CORS, OPTIONS, and route configuration.'
      : 'Could not reach the profile API. Check the network and API Gateway route.');
  }
  const responseBody = await res.clone().text().catch(() => '');
  let diagnosticBody = '';
  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;
    diagnosticBody = JSON.stringify(Object.fromEntries(
      ['error', 'message', 'requestId', 'status', 'service']
        .filter(key => typeof parsed[key] === 'string')
        .map(key => [key, parsed[key]]),
    ));
  } catch {
    diagnosticBody = responseBody.slice(0, 200);
  }
  if (!res.ok) throw new Error(`Profile API returned ${res.status}${diagnosticBody ? `: ${diagnosticBody.slice(0, 300)}` : ''}`);
  return res;
};
export const uploadProfile = (token: string | null, p: Profile) => call('PUT', token, p);
export const downloadProfile = async (token: string | null): Promise<Profile | null> => {
  const response = await call('GET', token);
  const payload = await response.json() as { profile?: Profile | null };
  return payload.profile ?? null;
};
export const deleteRemoteProfile = (token: string | null) => call('DELETE', token);
