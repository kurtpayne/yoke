// KV data loader with per-isolate in-memory cache
// Usage: const data = await loadData<MyType>(env.REFERENCE_DATA, 'my-key');
// Each isolate caches for 1 hour to avoid redundant KV reads.

const cache = new Map<string, { data: unknown; loaded: number }>();
const TTL = 60 * 60 * 1000; // 1 hour in-memory cache per isolate

export async function loadData<T>(kv: KVNamespace | undefined, key: string): Promise<T | null> {
  if (!kv) return null;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.loaded < TTL) return cached.data as T;

  const raw = await kv.get(key, 'json');
  if (raw) cache.set(key, { data: raw, loaded: Date.now() });
  return raw as T | null;
}
