import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 60000,
});

export async function health() {
  const r = await api.get("/health");
  return r.data;
}

export async function chatAsk(question, session_id) {
  const r = await api.post("/chat", { question, top_k: 6, session_id });
  return r.data;
}

export async function listCompanies(q = "") {
  const r = await api.get("/companies", { params: { q } });
  return r.data;
}

export async function getStats() {
  const r = await api.get("/stats");
  return r.data;
}

export async function parseResume(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await api.post("/resume/parse", fd, { headers: { "Content-Type": "multipart/form-data" } });
  return r.data;
}

export async function gapAnalysis(resume_text, job_description) {
  const fd = new FormData();
  fd.append("resume_text", resume_text);
  fd.append("job_description", job_description);
  const r = await api.post("/gap-analysis", fd);
  return r.data;
}

export async function interviewPrep(payload) {
  const r = await api.post("/interview-prep", payload);
  return r.data;
}
