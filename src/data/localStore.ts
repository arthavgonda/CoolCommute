import * as FS from 'expo-file-system';
const path = (k: string) => `${FS.documentDirectory}${k}.json`;
export const readJson = async <T,>(k: string): Promise<T | null> => {
  try {
    return JSON.parse(await FS.readAsStringAsync(path(k))) as T;
  } catch {
    return null;
  }
};
export const writeJson = (k: string, v: unknown) =>
  FS.writeAsStringAsync(path(k), JSON.stringify(v, null, 2));
export const removeJson = (k: string) => FS.deleteAsync(path(k), { idempotent: true });
export const sizeOf = async (k: string) => {
  const info = await FS.getInfoAsync(path(k));
  return info.exists ? info.size : 0;
};
