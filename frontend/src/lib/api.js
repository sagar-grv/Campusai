import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 60000,
});

let _visitorId = null;
function getVisitorId() {
  if (_visitorId) return _visitorId;
  try {
    let v = localStorage.getItem("campus-visitor");
    if (!v) {
      v = "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("campus-visitor", v);
    }
    _visitorId = v;
    return v;
  } catch {
    return "v-anon";
  }
}

api.interceptors.request.use((config) => {
  config.headers["X-Visitor-Id"] = getVisitorId();
  return config;
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
  const params = {};
  if (typeof q === "string") {
    if (q) params.q = q;
  } else if (q && typeof q === "object") {
    const opts = q;
    if (opts.q) params.q = opts.q;
    if (opts.batch) params.batch = opts.batch;
    if (opts.branch) params.branch = opts.branch;
    if (opts.min_ctc !== undefined && opts.min_ctc !== null && opts.min_ctc !== "") {
      params.min_ctc = opts.min_ctc;
    }
    if (opts.sort) params.sort = opts.sort;
    if (opts.page !== undefined && opts.page !== null && opts.page !== "") {
      params.page = opts.page;
    }
    if (opts.page_size !== undefined && opts.page_size !== null && opts.page_size !== "") {
      params.page_size = opts.page_size;
    }
  }
  const r = await api.get("/companies", { params });
  return r.data;
}

export async function getCompanyStats() {
  const r = await api.get("/companies/stats");
  return r.data;
}

export async function getCompany(id) {
  const r = await api.get(`/companies/${id}`);
  return r.data;
}

export async function streamChat(question, session_id, onMeta, onDelta, onDone, onError) {
  const body = JSON.stringify({ question, top_k: 6, session_id, stream: true });
  let res;
  try {
    res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body,
    });
  } catch (err) {
    onError(err);
    return;
  }
  if (!res.ok || !res.body || !res.body.getReader) {
    onError(new Error(`Stream unavailable (${res.status})`));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const raw of chunk.split("\n")) {
          const line = raw.trim();
          if (!line.startsWith("data: ")) continue;
          let evt;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (evt.type === "meta") onMeta(evt);
          else if (evt.type === "delta") onDelta(evt);
          else if (evt.type === "done") onDone(evt);
        }
      }
    }
  } catch (err) {
    onError(err);
  }
}

export async function getStats() {
  const r = await api.get("/stats");
  return r.data;
}

export async function getDashboard() {
  const r = await api.get("/dashboard");
  return r.data;
}

export async function parseResume(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await api.post("/resume/parse", fd, { headers: { "Content-Type": "multipart/form-data" } });
  return r.data;
}

export async function gapAnalysis(resume_text, job_description) {
  const r = await api.post("/gap-analysis", { resume_text, job_description });
  return r.data;
}

export async function interviewPrep(payload) {
  const r = await api.post("/interview-prep", payload);
  return r.data;
}

export async function checkEligibility(payload) {
  const r = await api.post("/eligibility", payload);
  return r.data;
}

export async function compareCompanies(company_ids) {
  const r = await api.post("/companies/compare", { company_ids });
  return r.data;
}

export async function adminLogin(username, password) {
  const r = await api.post("/admin/login", { username, password });
  return r.data;
}

export async function getAdminUsage(token) {
  const r = await api.get("/admin/usage", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.data;
}

export async function getAdminStatus(token) {
  const r = await api.get("/admin/status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.data;
}

export async function ingestCompanies(token, files, batch, wipe) {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("batch", batch || "");
  fd.append("wipe", wipe ? "true" : "false");
  const r = await api.post("/ingest", fd, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    },
  });
  return r.data;
}

export { useChat } from "./swr";

