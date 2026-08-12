import React from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  Filter,
  GraduationCap,
  Percent,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Building2,
} from "lucide-react";
import { checkEligibility } from "../lib/api";

const BRANCHES = [
  "CS",
  "IT",
  "EXTC",
  "CE",
  "AI",
  "DS",
  "CSBS",
  "MCA",
  "MECH",
  "CIVIL",
];

export default function Eligibility() {
  const [cgpa, setCgpa] = React.useState(7.5);
  const [branch, setBranch] = React.useState("CS");
  const [tenthPct, setTenthPct] = React.useState(75);
  const [twelfthPct, setTwelfthPct] = React.useState(75);
  const [hasBacklog, setHasBacklog] = React.useState(false);
  const [batch, setBatch] = React.useState("2025");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [tab, setTab] = React.useState("eligible"); // "eligible" | "ineligible"

  async function handleCheck(e) {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await checkEligibility({
        cgpa: Number(cgpa),
        branch,
        tenth_pct: Number(tenthPct),
        twelfth_pct: Number(twelfthPct),
        has_backlog: hasBacklog,
        batch: batch === "all" ? null : batch,
      });
      setResult(res);
      toast.success(`Evaluated ${res.summary.total_evaluated} companies!`);
    } catch (err) {
      toast.error("Failed to check eligibility.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    handleCheck();
  }, []);

  return (
    <div
      className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12"
      data-testid="eligibility-page"
    >
      <div className="mb-8">
        <div className="overline">MODULE / 05 · ELIGIBILITY CHECKER</div>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
          Personalized Audit.
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Input your academic profile to instantly discover which company drive
          you qualify for and view exact reasons if disqualified.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* LEFT – Inputs Form */}
        <div className="md:col-span-4">
          <form onSubmit={handleCheck} className="space-y-4">
            <div className="sharp-card p-5">
              <div className="overline mb-3">BRANCH & BATCH</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="overline mb-1 block">BRANCH</label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full border border-line bg-white p-2.5 font-mono text-xs outline-none focus:border-signal"
                    data-testid="eligibility-branch"
                  >
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="overline mb-1 block">BATCH</label>
                  <select
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    className="w-full border border-line bg-white p-2.5 font-mono text-xs outline-none focus:border-signal"
                    data-testid="eligibility-batch"
                  >
                    <option value="2025">2025 Batch</option>
                    <option value="2023-24">2023-24 Batch</option>
                    <option value="all">All Batches</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="sharp-card p-5">
              <div className="overline mb-3">CURRENT CGPA</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={2.0}
                  max={10.0}
                  step={0.1}
                  value={cgpa}
                  onChange={(e) => setCgpa(e.target.value)}
                  className="flex-1 accent-signal"
                  data-testid="eligibility-cgpa-slider"
                />
                <span className="font-mono text-base font-bold text-ink">
                  {Number(cgpa).toFixed(1)}
                </span>
              </div>
            </div>

            <div className="sharp-card p-5">
              <div className="overline mb-3">10TH & 12TH PERCENTAGE</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="overline mb-1 block">10TH %</label>
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={tenthPct}
                    onChange={(e) => setTenthPct(e.target.value)}
                    className="w-full border border-line p-2.5 font-mono text-xs outline-none focus:border-signal"
                    data-testid="eligibility-tenth"
                  />
                </div>
                <div>
                  <label className="overline mb-1 block">12TH / DIPLOMA %</label>
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={twelfthPct}
                    onChange={(e) => setTwelfthPct(e.target.value)}
                    className="w-full border border-line p-2.5 font-mono text-xs outline-none focus:border-signal"
                    data-testid="eligibility-twelfth"
                  />
                </div>
              </div>
            </div>

            <div className="sharp-card p-5">
              <div className="overline mb-3">BACKLOG STATUS</div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBacklog}
                  onChange={(e) => setHasBacklog(e.target.checked)}
                  className="h-4 w-4 rounded-none accent-signal"
                  data-testid="eligibility-backlog"
                />
                <span className="text-sm font-semibold">
                  I currently have active backlogs / KTs
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-signal w-full justify-center"
              data-testid="eligibility-submit"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Auditing…
                </>
              ) : (
                <>
                  Evaluate Eligibility <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT – Results Dashboard */}
        <div className="md:col-span-8" data-testid="eligibility-results">
          {result && (
            <div className="space-y-5 fade-up">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 border border-line bg-ink text-white md:grid-cols-4">
                <Metric
                  label="ELIGIBLE DRIVES"
                  value={result.summary.eligible_count}
                  sub={`of ${result.summary.total_evaluated} companies`}
                />
                <Metric
                  label="QUALIFICATION"
                  value={`${result.summary.eligible_percentage}%`}
                  sub="match rate"
                  border
                />
                <Metric
                  label="MAX ELIGIBLE CTC"
                  value={`${result.summary.max_eligible_ctc} LPA`}
                  sub="highest package"
                  border
                />
                <Metric
                  label="AVG ELIGIBLE CTC"
                  value={`${result.summary.avg_eligible_ctc} LPA`}
                  sub="average package"
                  border
                />
              </div>

              {/* Tabs */}
              <div className="flex border-b border-line">
                <button
                  className={`px-5 py-3 font-mono text-xs uppercase tracking-widerX transition-colors ${
                    tab === "eligible"
                      ? "border-b-2 border-signal bg-paper font-bold text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                  onClick={() => setTab("eligible")}
                  data-testid="tab-eligible"
                >
                  Eligible Companies ({result.eligible.length})
                </button>
                <button
                  className={`px-5 py-3 font-mono text-xs uppercase tracking-widerX transition-colors ${
                    tab === "ineligible"
                      ? "border-b-2 border-error bg-paper font-bold text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                  onClick={() => setTab("ineligible")}
                  data-testid="tab-ineligible"
                >
                  Ineligible ({result.ineligible.length})
                </button>
              </div>

              {/* Company List Display */}
              <div className="space-y-3">
                {tab === "eligible" &&
                  result.eligible.map((c, i) => (
                    <div
                      key={i}
                      className="sharp-card p-5 border-l-4 border-l-success"
                      data-testid={`eligible-company-${i}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2
                              size={16}
                              className="text-success"
                              strokeWidth={1.5}
                            />
                            <h3 className="font-display text-xl font-bold">
                              {c.company}
                            </h3>
                          </div>
                          <p className="mt-1 text-sm text-muted">
                            Role: {c.role || "N/A"}
                          </p>
                        </div>
                        <span className="font-mono text-base font-bold text-signal">
                          {c.ctc || "—"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono text-muted">
                        <span className="bg-paper px-2 py-1 border border-line">
                          Branches: {c.branches || "All"}
                        </span>
                        {c.cgpa && (
                          <span className="bg-paper px-2 py-1 border border-line">
                            Cutoff: {c.cgpa}
                          </span>
                        )}
                        {c.mode && (
                          <span className="bg-paper px-2 py-1 border border-line">
                            {c.mode}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                {tab === "ineligible" &&
                  result.ineligible.map((c, i) => (
                    <div
                      key={i}
                      className="sharp-card p-5 border-l-4 border-l-error"
                      data-testid={`ineligible-company-${i}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <XCircle
                              size={16}
                              className="text-error"
                              strokeWidth={1.5}
                            />
                            <h3 className="font-display text-xl font-bold">
                              {c.company}
                            </h3>
                          </div>
                          <p className="mt-1 text-sm text-muted">
                            Role: {c.role || "N/A"}
                          </p>
                        </div>
                        <span className="font-mono text-sm text-subtle">
                          {c.ctc || "—"}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1">
                        {c.reasons.map((r, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 font-mono text-xs text-error"
                          >
                            <AlertCircle size={12} /> {r}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, border }) {
  return (
    <div className={`p-4 ${border ? "border-l border-white/20" : ""}`}>
      <div className="font-display text-3xl font-black">{value}</div>
      <div className="overline mt-1 text-[10px] text-white/60">{label}</div>
      <div className="font-mono text-[10px] text-subtle">{sub}</div>
    </div>
  );
}
