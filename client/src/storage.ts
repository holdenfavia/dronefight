// Per-browser persistence. localStorage can throw or be empty (private windows, blocked storage),
// so every access is guarded and callers always get a usable fallback.

const PREFIX = 'dronefight.';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: settings last for this session only.
  }
}
