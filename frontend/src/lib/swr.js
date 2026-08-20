import useSWR from 'swr';
import { api } from './api';

const fetcher = (url) => api.get(url).then(r => r.data);

const CACHE_KEY = 'campus-swr:v1';

export function localStorageProvider() {
  let cache;
  try {
    cache = new Map(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'));
  } catch {
    cache = new Map();
  }

  const persist = () => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch {}
  };

  window.addEventListener('beforeunload', persist);

  return new Proxy(cache, {
    get(target, prop, receiver) {
      if (prop === 'set') {
        return (key, value) => {
          const result = target.set(key, value);
          persist();
          return result;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function useCompanies(params) {
  const key = `/companies?${new URLSearchParams(params).toString()}`;
  return useSWR(key, fetcher, { revalidateOnFocus: false, dedupingInterval: 2000 });
}

export function useStats() {
  return useSWR('/companies/stats', fetcher, { revalidateOnFocus: false, dedupingInterval: 30000 });
}

export function useDashboard() {
  return useSWR('/dashboard', fetcher, { revalidateOnFocus: false, dedupingInterval: 30000 });
}

export function useChat(question, sessionId) {
  return useSWR(question ? ['/chat', { question, top_k: 6, session_id: sessionId }] : null,
    ([, body]) => api.post('/chat', body).then(r => r.data), { revalidate: false });
}