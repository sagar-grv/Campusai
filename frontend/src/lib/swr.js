import useSWR from 'swr';
import { api } from './api';

const fetcher = (url) => api.get(url).then(r => r.data);

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