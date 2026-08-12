import React from "react";
import { toast } from "sonner";
import {
  Search,
  Building2,
  Loader2,
  Briefcase,
  IndianRupee,
  GraduationCap,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { listCompanies, getStats } from "../lib/api";

export default function Companies() {
  const [companies, setCompanies] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(null);

  const fetchCompanies = React.useCallback(async (q) => {
    setLoading(true);
    try {
      const res = await listCompanies(q);
      setCompanies(res.companies || []);
    } catch (err) {
      toast.error("Failed to load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCompanies("");
    getStats().then(setStats).catch(() => {});
  }, [fetchCompanies]);

  // Debounced search
  const timerRef = React.useRef(null);
  function handleSearch(val) {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchCompanies(val), 350);
  }

  return (
    <div
      className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12"
      data-testid="companies-page"
    >
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="overline">MODULE / 04 · COMPANY EXPLORER</div>
          <h1 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
            Every company. Indexed.
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Browse placement records across 2023-24 and 2025 batches. Search by
            company, role, branch, or eligibility.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div
          className="mb-8 grid grid-cols-2 border border-line bg-ink text-white md:grid-cols-4"
          data-testid="company-stats"
        >
          <MiniStat label="Total Companies" value={stats.total_companies} />
          <MiniStat
            label="Avg CTC (LPA)"
            value={stats.avg_ctc_lpa}
            border
          />
          <MiniStat label="Max CTC (LPA)" value={stats.max_ctc_lpa} border />
          <MiniStat
            label="Top Roles"
            value={stats.top_roles?.length || 0}
            border
          />
        </div>
      )}

      {/* Search */}
      <div className="sharp-card mb-6 flex items-center gap-3 px-4 py-3">
        <Search size={18} className="text-muted" strokeWidth={1.5} />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-subtle"
          placeholder="Search companies, roles, branches, eligibility..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          data-testid="company-search"
        />
        <span className="shrink-0 font-mono text-[10px] text-subtle">
          {companies.length} results
        </span>
      </div>

      {/* Company list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2
            size={28}
            className="animate-spin text-signal"
            strokeWidth={1.5}
          />
        </div>
      ) : companies.length === 0 ? (
        <div className="sharp-card flex flex-col items-center justify-center p-12 text-center">
          <Building2 size={36} className="text-line" strokeWidth={1.5} />
          <p className="mt-4 font-display text-xl font-black tracking-tighter">
            No companies found.
          </p>
          <p className="mt-1 text-sm text-muted">
            Try adjusting your search query.
          </p>
        </div>
      ) : (
        <div className="border border-line bg-white" data-testid="company-list">
          {/* Table header (desktop) */}
          <div className="hidden border-b border-line bg-paper px-5 py-3 md:grid md:grid-cols-12 md:gap-4">
            <span className="overline col-span-3">COMPANY</span>
            <span className="overline col-span-2">CTC</span>
            <span className="overline col-span-3">ROLE</span>
            <span className="overline col-span-2">BRANCHES</span>
            <span className="overline col-span-2">BATCH</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-line">
            {companies.map((c, i) => {
              const isOpen = expanded === i;
              return (
                <div key={i} data-testid={`company-row-${i}`}>
                  <button
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-paper md:grid md:grid-cols-12"
                    onClick={() => setExpanded(isOpen ? null : i)}
                    data-testid={`company-toggle-${i}`}
                  >
                    <span className="col-span-3 flex items-center gap-2 font-display text-sm font-bold tracking-tight md:text-base">
                      <Building2
                        size={14}
                        className="shrink-0 text-signal"
                        strokeWidth={1.5}
                      />
                      {c.company || "—"}
                    </span>
                    <span className="col-span-2 font-mono text-xs md:text-sm">
                      {c.ctc || "—"}
                    </span>
                    <span className="col-span-3 hidden text-sm text-muted md:block">
                      {(c.role || "—").slice(0, 50)}
                    </span>
                    <span className="col-span-2 hidden font-mono text-xs text-muted md:block">
                      {(c.branches || "—").slice(0, 30)}
                    </span>
                    <span className="col-span-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-subtle">
                        {c.batch || c.source_file?.includes("2025") ? "2025" : "2023-24"}
                      </span>
                      {isOpen ? (
                        <ChevronUp size={14} className="text-subtle" />
                      ) : (
                        <ChevronDown size={14} className="text-subtle" />
                      )}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div
                      className="border-t border-line bg-paper px-5 py-5 fade-up"
                      data-testid={`company-detail-${i}`}
                    >
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Detail
                          icon={
                            <Briefcase
                              size={14}
                              className="text-signal"
                              strokeWidth={1.5}
                            />
                          }
                          label="ROLE"
                          value={c.role}
                        />
                        <Detail
                          icon={
                            <IndianRupee
                              size={14}
                              className="text-signal"
                              strokeWidth={1.5}
                            />
                          }
                          label="CTC"
                          value={c.ctc}
                        />
                        <Detail
                          icon={
                            <GraduationCap
                              size={14}
                              className="text-signal"
                              strokeWidth={1.5}
                            />
                          }
                          label="BRANCHES"
                          value={c.branches}
                        />
                        <Detail
                          icon={
                            <Calendar
                              size={14}
                              className="text-signal"
                              strokeWidth={1.5}
                            />
                          }
                          label="DATE"
                          value={c.date}
                        />
                      </div>
                      {(c.eligibility || c.cgpa) && (
                        <div className="mt-4 border-t border-line pt-4">
                          <div className="overline mb-2">ELIGIBILITY</div>
                          <p className="text-sm text-muted">
                            {c.eligibility || "—"}
                            {c.cgpa && (
                              <span className="ml-2 font-mono text-xs text-signal">
                                CGPA: {c.cgpa}
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                      {c.notes && (
                        <div className="mt-3 border-t border-line pt-3">
                          <div className="overline mb-2">PROCESS / NOTES</div>
                          <p className="text-sm text-muted">{c.notes}</p>
                        </div>
                      )}
                      {c.mode && (
                        <span className="mt-3 inline-block border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-widerX text-muted">
                          {c.mode}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, border }) {
  return (
    <div
      className={`px-5 py-4 ${border ? "border-l border-white/20" : ""}`}
    >
      <div className="font-display text-2xl font-black tracking-tighter md:text-3xl">
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widerX text-white/60">
        {label}
      </div>
    </div>
  );
}

function Detail({ icon, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1">
        {icon}
        <span className="overline">{label}</span>
      </div>
      <p className="mt-1 text-sm">{value || "—"}</p>
    </div>
  );
}
