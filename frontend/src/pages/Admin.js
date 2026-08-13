import React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BarChart3,
  Cpu,
  Database,
  FileText,
  FileUp,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Server,
  ShieldCheck,
  User,
  Workflow,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminLogin, getAdminUsage, getAdminStatus, ingestCompanies } from "../lib/api";
import { CountUp } from "../components/motion";

const TOOLTIP_STYLE = {
  border: "1px solid #d4d4d4",
  borderRadius: 0,
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 11,
  background: "#fff",
};

const TICK = { fontSize: 10, fontFamily: "JetBrains Mono, monospace" };
const GRID = "#d4d4d4";
const CURSOR = { fill: "#f4f4f0" };

const TABS = [
  { name: "ingest", label: "Ingest", icon: FileUp },
  { name: "usage", label: "Usage", icon: BarChart3 },
  { name: "pipeline", label: "Pipeline", icon: Workflow },
];

const PIPELINE = [
  { title: "User / Student", caption: "browser · every request tagged with X-Visitor-Id", icon: User },
  { title: "React Frontend", caption: "SPA · axios /api client · /admin gate", icon: MonitorSmartphone },
  { title: "FastAPI (serverless)", caption: "REST + SSE streaming · CORS", icon: Server },
  { title: "Security Layer", caption: "rate limit + prompt-injection guard + admin token", icon: ShieldCheck },
  { title: "Hybrid Retrieval", caption: "keyword + vector embeddings (Gemini Embedding 001)", icon: Layers },
  { title: "MongoDB", caption: "companies + chunks collections", icon: Database },
  { title: "Multi-tier LLM", caption: "Gemini 2.5 Flash → NVIDIA fallback", icon: Cpu },
  { title: "Grounded answer + citations", caption: "cites sources · refuses to guess", icon: FileText },
  { title: "Frontend", caption: "chat thread with mono citation tags", icon: Monitor },
];

export default function Admin() {
  const [token, setToken] = React.useState(() => {
    try {
      return localStorage.getItem("campus-admin-token") || "";
    } catch {
      return "";
    }
  });
  const [tab, setTab] = React.useState("ingest");

  function handleAuthed(nextToken) {
    setToken(nextToken);
  }

  function handleAuthFail() {
    try {
      localStorage.removeItem("campus-admin-token");
    } catch {
      /* ignore */
    }
    setToken("");
    toast.error("Admin session expired. Sign in again.");
  }

  function handleLogout() {
    try {
      localStorage.removeItem("campus-admin-token");
    } catch {
      /* ignore */
    }
    setToken("");
    toast.success("Signed out of admin.");
  }

  if (!token) {
    return (
      <div
        className="mx-auto flex min-h-[80vh] max-w-[1400px] items-center justify-center px-5 py-10 md:px-10"
        data-testid="admin-login"
      >
        <LoginPanel onAuthed={handleAuthed} />
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12"
      data-testid="admin-page"
    >
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="overline">MODULE / 00 · ADMIN CONSOLE</div>
          <h1 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
            Control the stack.
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Ingest placement PDFs, watch platform usage, and trace the pipeline
            end to end.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="btn-outline shrink-0 self-start !px-5 !py-2.5 text-xs md:self-auto"
          data-testid="admin-logout"
        >
          <LogOut size={15} strokeWidth={1.8} /> Sign out
        </button>
      </header>

      <div className="mb-8 flex border border-line bg-white" data-testid="admin-tabs">
        {TABS.map((t) => {
          const active = tab === t.name;
          const Icon = t.icon;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => setTab(t.name)}
              aria-selected={active}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 font-mono text-[11px] uppercase tracking-widerX transition-colors md:flex-none md:px-7 ${
                active ? "bg-ink font-bold text-white" : "text-muted hover:bg-paper hover:text-ink"
              }`}
              data-testid={`admin-tab-${t.name}`}
            >
              <Icon size={15} strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "ingest" && <IngestTab token={token} onAuthFail={handleAuthFail} />}
      {tab === "usage" && <UsageTab token={token} onAuthFail={handleAuthFail} />}
      {tab === "pipeline" && <PipelineTab token={token} onAuthFail={handleAuthFail} />}
    </div>
  );
}

function LoginPanel({ onAuthed }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      const res = await adminLogin(username, password);
      if (!res || !res.token) throw new Error("No token returned");
      try {
        localStorage.setItem("campus-admin-token", res.token);
      } catch {
        /* ignore */
      }
      toast.success("Signed in as administrator");
      onAuthed(res.token);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        toast.error("Invalid credentials");
      } else {
        toast.error(err?.response?.data?.detail || "Sign-in failed. Is the backend up?");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md border border-line bg-[#0a0a0a] p-7 text-white md:p-8"
      data-testid="admin-login-form"
    >
      <div className="flex items-center gap-2.5">
        <span className="h-6 w-6 bg-signal" aria-hidden />
        <span className="font-display text-xl font-black tracking-tighter">
          Campus<span className="text-signal">.AI</span>
        </span>
        <span className="ml-auto border border-white/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widerX text-white/60">
          Admin
        </span>
      </div>

      <div className="mt-7 font-mono text-[10px] uppercase tracking-widerX text-white/60">
        Restricted console / bearer token
      </div>
      <h1 className="mt-1 font-display text-3xl font-black tracking-tighter">
        Sign in to the stack.
      </h1>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widerX text-white/60">
            Username
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="admin"
            style={{ background: "#111111", color: "#ffffff", borderColor: "rgba(255,255,255,0.3)" }}
            className="w-full border px-3 py-2.5 font-mono text-sm outline-none placeholder:text-white/40"
            data-testid="admin-username"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-widerX text-white/60">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            style={{ background: "#111111", color: "#ffffff", borderColor: "rgba(255,255,255,0.3)" }}
            className="w-full border px-3 py-2.5 font-mono text-sm outline-none placeholder:text-white/40"
            data-testid="admin-password"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !username || !password}
        className="mt-6 flex w-full items-center justify-center gap-2 border border-signal bg-signal px-5 py-3 font-semibold text-white transition-colors hover:bg-signalHover disabled:pointer-events-none disabled:opacity-60"
        data-testid="admin-signin"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Signing in…
          </>
        ) : (
          <>
            Sign in <ArrowRight size={16} />
          </>
        )}
      </button>

      <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widerX text-white/40">
        <KeyRound size={11} /> protected endpoint · /admin/login
      </p>
    </form>
  );
}

function IngestTab({ token, onAuthFail }) {
  const [files, setFiles] = React.useState([]);
  const [batch, setBatch] = React.useState("");
  const [wipe, setWipe] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!files.length) {
      toast.error("Choose at least one PDF first.");
      return;
    }
    setLoading(true);
    try {
      const res = await ingestCompanies(token, files, batch, wipe);
      setResult(res);
      toast.success(`Ingested ${res.companies_inserted} companies`);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        onAuthFail();
        return;
      }
      toast.error(err?.response?.data?.detail || err?.message || "Ingest failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-12" data-testid="admin-ingest">
      <div className="min-w-0 md:col-span-5">
        <div className="mb-3">
          <div className="overline">MODULE / ADMIN · DATA INGESTION</div>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tighter md:text-4xl">
            Feed the database.
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="overline mb-1 block">PLACEMENT PDFs</span>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="w-full border border-line bg-white p-3 font-mono text-xs text-muted outline-none file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-2 file:font-mono file:text-xs file:text-white focus:border-signal"
              data-testid="ingest-files"
            />
          </label>

          <label className="block">
            <span className="overline mb-1 block">BATCH (OPTIONAL)</span>
            <input
              type="text"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="2025"
              className="w-full border border-line bg-white p-2.5 font-mono text-sm outline-none placeholder:text-subtle focus:border-signal"
              data-testid="ingest-batch"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={wipe}
              onChange={(e) => setWipe(e.target.checked)}
              className="h-4 w-4 rounded-none accent-signal"
              data-testid="ingest-wipe"
            />
            <span className="text-sm font-semibold">Replace all existing data</span>
          </label>

          <div className="flex items-start gap-3 border border-signal bg-white p-4" data-testid="ingest-notice">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-signal" strokeWidth={1.5} />
            <p className="font-mono text-xs leading-relaxed text-muted">
              Wipe mode drops the companies and chunks collections before ingesting.
              Validation failures abort the whole batch server-side — records are only
              written after every PDF passes all checks.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-signal w-full justify-center"
            data-testid="ingest-submit"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Ingesting…
              </>
            ) : (
              <>
                Upload &amp; Ingest <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="min-w-0 md:col-span-7">
        {result ? (
          <div className="fade-up" data-testid="ingest-result">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border border-b-0 border-line bg-ink px-5 py-4 text-white">
              <div>
                <div className="font-display text-2xl font-black tracking-tighter">
                  {result.files_processed ?? 0}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widerX text-white/60">Files</div>
              </div>
              <div>
                <div className="font-display text-2xl font-black tracking-tighter">
                  {result.companies_inserted ?? 0}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widerX text-white/60">Companies</div>
              </div>
              <div>
                <div className="font-display text-2xl font-black tracking-tighter">
                  {result.chunks_embedded ?? 0}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widerX text-white/60">Chunks</div>
              </div>
            </div>
            <div className="border border-line bg-white">
              <div className="hidden border-b border-line bg-paper px-5 py-3 md:grid md:grid-cols-12 md:gap-4">
                <span className="overline col-span-6">SOURCE FILE</span>
                <span className="overline col-span-3">RECORDS</span>
                <span className="overline col-span-3">EXPECTED SR MAX</span>
              </div>
              <div className="divide-y divide-line">
                {(result.per_file || []).map((row, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-1 px-5 py-3 md:grid md:grid-cols-12 md:items-center md:gap-4"
                    data-testid={`ingest-file-row-${i}`}
                  >
                    <span className="col-span-6 flex items-center gap-2 font-mono text-xs text-ink md:text-sm">
                      <FileText size={13} className="shrink-0 text-signal" strokeWidth={1.5} />
                      <span className="truncate">{row.file}</span>
                    </span>
                    <span className="col-span-3 font-mono text-xs text-muted">
                      {row.records ?? "—"} records
                    </span>
                    <span className="col-span-3 font-mono text-xs text-subtle">
                      SR max {row.expected_sr_max ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center border border-dashed border-line bg-white">
            <div className="max-w-xs text-center">
              <FileUp size={28} className="mx-auto text-subtle" strokeWidth={1.5} />
              <p className="mt-3 font-display text-lg font-black tracking-tighter">
                No ingest yet.
              </p>
              <p className="mt-1 text-sm text-muted">
                Pick PDFs on the left and run the pipeline. Per-file results land here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UsageTab({ token, onAuthFail }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    getAdminUsage(token)
      .then((d) => setData(d))
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          onAuthFail();
          return;
        }
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [token, onAuthFail]);

  React.useEffect(() => {
    load();
  }, [load]);

  const perEndpoint = data?.per_endpoint ?? [];
  const daily = (data?.daily ?? []).slice(-14);
  const topQuestions = data?.top_questions ?? [];
  const topCompanies = data?.top_companies ?? [];
  const chatCount = perEndpoint.find((e) => e.event === "chat")?.count ?? 0;

  if (loading) {
    return (
      <div aria-busy="true" data-testid="admin-usage">
        <div className="grid grid-cols-2 border border-line bg-white md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[84px] px-5 py-4">
              <span className="skel block h-8 w-20" />
              <span className="skel mt-2 block h-2 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="border border-line bg-white p-4 md:p-5">
              <span className="skel mb-4 block h-3 w-40" />
              <span className="skel block h-[220px] w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-testid="admin-usage">
        <ErrState onRetry={load} testid="usage-retry" />
      </div>
    );
  }

  return (
    <div data-testid="admin-usage">
      <div
        className="grid grid-cols-2 border border-line bg-ink text-white md:grid-cols-4"
        data-testid="usage-stats"
      >
        <MiniStat label="Total Requests" value={data.total_requests ?? 0} />
        <MiniStat label="Unique Visitors" value={data.unique_visitors ?? 0} border />
        <MiniStat label="Unique IPs" value={data.unique_ips ?? 0} border />
        <MiniStat label="Chat Queries" value={chatCount} border />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <ChartPanel
          title="REQUESTS BY ENDPOINT"
          testid="usage-chart-endpoints"
          empty={!perEndpoint.length}
        >
          <BarChart data={perEndpoint}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="event" tick={TICK} interval={0} angle={-25} textAnchor="end" height={56} />
            <YAxis tick={TICK} width={30} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
            <Bar dataKey="count" fill="#0a0a0a" />
          </BarChart>
        </ChartPanel>
        <ChartPanel
          title="DAILY REQUESTS · LAST 14 DAYS"
          testid="usage-chart-daily"
          empty={!daily.length}
        >
          <BarChart data={daily}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={TICK} interval={0} />
            <YAxis tick={TICK} width={30} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
            <Bar dataKey="count" fill="#ff4d00" />
          </BarChart>
        </ChartPanel>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="border border-line bg-white" data-testid="usage-top-questions">
          <div className="overline border-b border-line bg-paper px-5 py-3">TOP QUESTIONS</div>
          {topQuestions.length === 0 ? (
            <EmptyRow text="No questions yet" />
          ) : (
            <div className="divide-y divide-line">
              {topQuestions.map((q, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3" data-testid={`usage-question-${i}`}>
                  <span className="w-6 shrink-0 font-mono text-xs font-bold text-signal">{i + 1}</span>
                  <p className="min-w-0 flex-1 truncate text-sm">{q.question}</p>
                  <span className="shrink-0 font-mono text-xs font-bold">{q.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border border-line bg-white" data-testid="usage-top-companies">
          <div className="overline border-b border-line bg-paper px-5 py-3">TOP COMPANIES</div>
          {topCompanies.length === 0 ? (
            <EmptyRow text="No data yet" />
          ) : (
            <div className="chip-scroll flex flex-wrap gap-2 p-5">
              {topCompanies.map((c, i) => (
                <span
                  key={i}
                  className="border border-line bg-paper px-3 py-1.5 font-mono text-xs"
                  data-testid={`usage-company-${i}`}
                >
                  <span className="font-bold text-ink">
                    {i + 1}. {c.company}
                  </span>
                  <span className="text-muted"> · {c.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PipelineTab({ token, onAuthFail }) {
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    getAdminStatus(token)
      .then((d) => setStatus(d))
      .catch((err) => {
        const s = err?.response?.status;
        if (s === 401 || s === 403) {
          onAuthFail();
          return;
        }
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [token, onAuthFail]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div data-testid="admin-pipeline">
      <div className="mb-3">
        <div className="overline">MODULE / ADMIN · ARCHITECTURE</div>
        <h2 className="mt-2 font-display text-3xl font-black tracking-tighter md:text-4xl">
          End to end.
        </h2>
      </div>

      <div className="mx-auto max-w-3xl">
        {PIPELINE.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <React.Fragment key={i}>
              <div className="border border-line bg-white p-5" data-testid={`pipeline-stage-${i}`}>
                <div className="flex items-center gap-3">
                  <Icon size={18} className="shrink-0 text-signal" strokeWidth={1.5} />
                  <div>
                    <div className="font-display text-base font-black tracking-tight md:text-lg">
                      {stage.title}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] uppercase tracking-widerX text-muted">
                      {stage.caption}
                    </div>
                  </div>
                </div>
                <div className="mt-3 font-mono text-[10px] uppercase tracking-widerX text-subtle">
                  Stage {String(i + 1).padStart(2, "0")} / {String(PIPELINE.length).padStart(2, "0")}
                </div>
              </div>
              {i < PIPELINE.length - 1 && (
                <div className="flex justify-center py-1 text-signal" aria-hidden="true">
                  <ArrowDown size={18} strokeWidth={2} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-10 border border-line bg-white p-5 md:p-6" data-testid="admin-live-status">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
          <div className="overline">LIVE STATUS</div>
        </div>
        {loading ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="skel h-9 w-36" />
              ))}
            </div>
            <span className="skel mt-4 block h-24 w-full" />
          </div>
        ) : error || !status ? (
          <ErrState onRetry={load} testid="pipeline-retry" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusChip label="DB MODE" value={status.db_mode} ok={status.db_mode === "real"} />
              <StatusChip
                label="GEMINI"
                value={status.gemini_ready ? "ready" : "down"}
                ok={status.gemini_ready === true}
              />
              <StatusChip label="COMPANIES" value={status.companies_count} />
              <StatusChip label="CHUNKS" value={status.chunks_count} />
              <StatusChip label="LAST INGEST" value={status.last_ingest || "never"} />
              <StatusChip label="CHAT MODEL" value={status.chat_model} />
              <StatusChip label="EMBED MODEL" value={status.embed_model} />
              <StatusChip label="VERSION" value={status.version} />
            </div>
            {status.rate_limits && Object.keys(status.rate_limits).length > 0 && (
              <div className="mt-5 border-t border-line pt-5">
                <div className="overline mb-3">RATE LIMITS</div>
                <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
                  {Object.entries(status.rate_limits).map(([k, v]) => (
                    <div key={k} className="bg-white px-4 py-3">
                      <div className="font-mono text-[10px] uppercase tracking-widerX text-subtle">
                        {k}
                      </div>
                      <div className="mt-1 font-mono text-sm font-bold text-ink">{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, border, decimals = 0 }) {
  return (
    <div className={`px-5 py-4 ${border ? "border-l border-white/20" : ""}`}>
      <div className="font-display text-2xl font-black tracking-tighter md:text-3xl">
        <CountUp value={value} decimals={decimals} />
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widerX text-white/60">
        {label}
      </div>
    </div>
  );
}

function ChartPanel({ title, testid, empty, children }) {
  return (
    <div className="border border-line bg-white p-4 md:p-5" data-testid={testid}>
      <div className="overline mb-4">{title}</div>
      {empty ? (
        <div className="flex h-[240px] items-center justify-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            No data yet
          </span>
        </div>
      ) : (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={240}>
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function StatusChip({ label, value, ok }) {
  let tone = "border-line bg-paper text-ink";
  if (ok === true) tone = "border-success text-success bg-paper";
  if (ok === false) tone = "border-error text-error bg-paper";
  return (
    <span className={`inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-xs ${tone}`}>
      <span className="uppercase tracking-widerX text-subtle">{label}</span>
      <span className="font-bold">{value ?? "—"}</span>
    </span>
  );
}

function EmptyRow({ text }) {
  return (
    <div className="flex h-24 items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">
      {text}
    </div>
  );
}

function ErrState({ onRetry, testid }) {
  return (
    <div className="sharp-card flex flex-col items-center justify-center p-10 text-center">
      <AlertTriangle size={28} className="text-signal" strokeWidth={1.5} />
      <p className="mt-3 font-display text-xl font-black tracking-tighter">Failed to load.</p>
      <p className="mt-1 text-sm text-muted">
        Check that the backend is reachable, then retry.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-outline mt-5 !py-2 !px-5 text-sm"
        data-testid={testid}
      >
        Retry
      </button>
    </div>
  );
}