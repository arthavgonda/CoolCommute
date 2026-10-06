const key = (k: string) => `cc:${k}.json`;
export const readJson = async <T,>(k: string): Promise<T | null> => {
  try {
    const raw = localStorage.getItem(key(k));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
export const writeJson = async (k: string, v: unknown) =>
  localStorage.setItem(key(k), JSON.stringify(v, null, 2));
export const removeJson = async (k: string) => localStorage.removeItem(key(k));
export const sizeOf = async (k: string) => (localStorage.getItem(key(k)) ?? '').length;
