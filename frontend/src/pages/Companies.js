import React from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Search,
  Building2,
  Briefcase,
  IndianRupee,
  GraduationCap,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion } from "motion/react";
import { listCompanies, getStats } from "../lib/api";
import { CountUp } from "../components/motion";

const BATCHES = ["", "2023-24", "2025"];
const BRANCHES = ["", "CS", "IT", "EXTC", "MECH", "CIVIL", "MCA", "AI", "DS", "CSBS"];
const SORTS = [
  { value: "", label: "Default" },
  { value: "ctc_desc", label: "CTC high → low" },
  { value: "ctc_asc", label: "CTC low → high" },
  { value: "name_asc", label: "Name A–Z" },
];
const PAGE_SIZES = [25, 50, 100];

export default function Companies() {
  const [companies, setCompanies] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(null);
  const [batch, setBatch] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [minCtc, setMinCtc] = React.useState("");
  const [sort, setSort] = React.useState("");
  const [pageSize, setPageSize] = React.useState(25);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const queryRef = React.useRef("");
  const filterRef = React.useRef({ batch: "", branch: "", minCtc: "", sort: "", pageSize: 25 });

  const fetchCompanies = React.useCallback(async (opts) => {
    setLoading(true);
    try {
      const res = await listCompanies(opts);
      setCompanies(res.companies || []);
      setTotal(res.total ?? res.companies?.length ?? 0);
    } catch (err) {
      toast.error("Failed to load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilters = React.useCallback(
    (p = 1) => {
      setPage(p);
      fetchCompanies({
        q: queryRef.current,
        ...filterRef.current,
        page: p,
        page_size: filterRef.current.pageSize,
      });
    },
    [fetchCompanies]
  );

  React.useEffect(() => {
    applyFilters();
    getStats().then(setStats).catch(() => {});
  }, [applyFilters]);

  function setFilter(key, value) {
    filterRef.current = { ...filterRef.current, [key]: value };
  }

  const timerRef = React.useRef(null);
  function handleSearch(val) {
    setQuery(val);
    queryRef.current = val;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => applyFilters(1), 350);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const activeFilterCount =
    [filterRef.current.batch, filterRef.current.branch, filterRef.current.minCtc, filterRef.current.sort].filter(Boolean)
      .length + (filterRef.current.pageSize !== 25 ? 1 : 0);

  function handlePageSize(val) {
    const size = Number(val);
    setPageSize(size);
    setFilter("pageSize", size);
    applyFilters(1);
  }

  function handleFilterChange(setter, key, val) {
    setter(val);
    setFilter(key, val);
    applyFilters(1);
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
        <div className="mb-8">
          <div
            className="grid grid-cols-2 border border-line bg-ink text-white md:grid-cols-4"
            data-testid="company-stats"
          >
            <MiniStat label="Total Companies" value={stats.total_companies} />
            <MiniStat
              label="Avg CTC (LPA)"
              value={stats.avg_ctc_lpa}
              border
              decimals={1}
            />
            <MiniStat label="Max CTC (LPA)" value={stats.max_ctc_lpa} border decimals={1} />
            <MiniStat
              label="Top Roles"
              value={stats.top_roles?.length || 0}
              border
            />
          </div>
          {(stats.by_batch?.length > 0 || stats.top_recruiters?.length > 0) && (
            <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
              <div className="min-w-0 border border-line bg-white px-5 py-4" data-testid="company-stats-batches">
                <div className="overline mb-3">DRIVES BY BATCH</div>
                <div className="chip-scroll flex gap-2 overflow-x-auto md:flex-wrap">
                  {stats.by_batch.map((b) => (
                    <span
                      key={b.batch}
                      className="shrink-0 border border-line bg-paper px-3 py-1.5 font-mono text-xs"
                    >
                      <span className="font-bold text-ink">{b.batch}</span>
                      <span className="text-muted"> · {b.count}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="min-w-0 border border-line bg-white px-5 py-4" data-testid="company-stats-recruiters">
                <div className="overline mb-3">TOP RECRUITERS</div>
                <div className="chip-scroll flex gap-2 overflow-x-auto md:flex-wrap">
                  {stats.top_recruiters.slice(0, 6).map((r) => (
                    <span
                      key={r.company}
                      className="shrink-0 border border-line bg-paper px-3 py-1.5 font-mono text-xs"
                    >
                      <span className="font-bold text-ink">{r.company}</span>
                      <span className="text-muted"> · {r.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters (mobile) */}
      <div className="mb-3 md:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="btn-outline w-full justify-between text-sm"
          data-testid="filter-toggle"
        >
          <span>Filter</span>
          <span className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <span
                className="font-mono text-xs text-signal"
                data-testid="filter-count"
              >
                ({activeFilterCount})
              </span>
            )}
            {filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
        {filtersOpen && (
          <div
            className="mt-3 flex flex-col gap-3 border border-line bg-white p-3"
            data-testid="filter-panel-mobile"
          >
            <FilterControls
              batch={batch}
              setBatch={setBatch}
              branch={branch}
              setBranch={setBranch}
              minCtc={minCtc}
              setMinCtc={setMinCtc}
              sort={sort}
              setSort={setSort}
              pageSize={pageSize}
              setPageSize={setPageSize}
              handleFilterChange={handleFilterChange}
              handlePageSize={handlePageSize}
            />
          </div>
        )}
      </div>

      {/* Filters (desktop) */}
      <div
        className="mb-3 hidden grid gap-3 border border-line bg-white p-3 md:grid md:grid-cols-5"
        data-testid="company-filters"
      >
        <FilterControls
          batch={batch}
          setBatch={setBatch}
          branch={branch}
          setBranch={setBranch}
          minCtc={minCtc}
          setMinCtc={setMinCtc}
          sort={sort}
          setSort={setSort}
          pageSize={pageSize}
          setPageSize={setPageSize}
          handleFilterChange={handleFilterChange}
          handlePageSize={handlePageSize}
        />
      </div>

      {/* Search */}
      <div className="sharp-card mb-6 flex items-center gap-3 px-4 py-3">
        <Search size={18} className="text-muted" strokeWidth={1.5} />
        <input
          className="w-full bg-transparent text-base outline-none placeholder:text-subtle md:text-sm"
          placeholder="Search companies, roles, branches, eligibility..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          data-testid="company-search"
        />
        <span className="shrink-0 font-mono text-[10px] text-subtle">
          {total || companies.length} results
        </span>
      </div>

      {/* Company list */}
      {loading ? (
        <div className="border border-line bg-white" aria-hidden="true">
          <div className="hidden border-b border-line bg-paper px-5 py-3 md:grid md:grid-cols-12 md:gap-4">
            <span className="overline col-span-3">COMPANY</span>
            <span className="overline col-span-2">CTC</span>
            <span className="overline col-span-3">ROLE</span>
            <span className="overline col-span-2">BRANCHES</span>
            <span className="overline col-span-2">BATCH</span>
          </div>
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 px-5 py-4 md:grid md:grid-cols-12 md:gap-4 ${
                i > 0 ? "border-t border-line" : ""
              }`}
              style={{ opacity: 1 - i * 0.09 }}
            >
              <span className="skel h-4 w-40 md:col-span-3" />
              <span className="skel col-span-2 h-3 w-12" />
              <span className="skel col-span-3 hidden h-3 w-52 md:block" />
              <span className="skel col-span-2 hidden h-3 w-32 md:block" />
              <span className="skel col-span-2 h-3 w-10" />
            </div>
          ))}
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
                <motion.div
                  key={`${i}-${query}-${page}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.23, 1, 0.32, 1],
                    delay: Math.min(i * 0.02, 0.25),
                  }}
                  data-testid={`company-row-${i}`}
                >
                  <div
                    className="flex min-h-[56px] w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-paper md:grid md:grid-cols-12"
                    onClick={() => setExpanded(isOpen ? null : i)}
                  >
                    <Link
                      to={`/companies/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="group col-span-3 flex items-center gap-2 font-display text-sm font-bold tracking-tight hover:text-signal md:text-base"
                      data-testid={`company-detail-link-${i}`}
                    >
                      <Building2
                        size={14}
                        className="shrink-0 text-signal"
                        strokeWidth={1.5}
                      />
                      <span>{c.company || "—"}</span>
                      <span className="hidden font-mono text-[10px] uppercase tracking-widerX text-subtle transition-colors group-hover:text-signal md:inline">
                        Details →
                      </span>
                    </Link>
                    <span className="col-span-2 font-mono text-xs md:text-sm">
                      {c.ctc || "—"}
                    </span>
                    <span className="col-span-3 hidden text-sm text-muted md:block">
                      {(c.role || "—").slice(0, 50)}
                    </span>
                    <span className="col-span-2 hidden font-mono text-xs text-muted md:block">
                      {(c.branches || "—").slice(0, 30)}
                    </span>
                    <span className="col-span-2 ml-auto flex items-center gap-2 md:ml-0 md:justify-between">
                      <span className="hidden font-mono text-xs text-subtle md:block">
                        {c.batch || c.source_file?.includes("2025") ? "2025" : "2023-24"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(isOpen ? null : i);
                        }}
                        aria-label="toggle details"
                        className="text-subtle transition-colors hover:text-ink"
                        data-testid={`company-toggle-${i}`}
                      >
                        {isOpen ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    </span>
                  </div>

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
                </motion.div>
              );
            })}
          </div>

          {total > pageSize && (
            <div
              className="flex items-center justify-between border-t border-line bg-paper px-5 py-3"
              data-testid="company-pagination"
            >
              <span className="font-mono text-[10px] uppercase tracking-widerX text-muted">
                Page {page} of {totalPages}
                <span className="hidden sm:inline"> · {total} results</span>
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-outline min-h-[44px] !py-2 !px-4 text-sm disabled:pointer-events-none disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => applyFilters(page - 1)}
                  data-testid="pagination-prev"
                >
                  ← Prev
                </button>
                <button
                  className="btn-outline min-h-[44px] !py-2 !px-4 text-sm disabled:pointer-events-none disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() => applyFilters(page + 1)}
                  data-testid="pagination-next"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterControls({
  batch,
  setBatch,
  branch,
  setBranch,
  minCtc,
  setMinCtc,
  sort,
  setSort,
  pageSize,
  setPageSize,
  handleFilterChange,
  handlePageSize,
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="overline">BATCH</span>
        <select
          value={batch}
          onChange={(e) => handleFilterChange(setBatch, "batch", e.target.value)}
          className="w-full border border-line bg-paper p-2 font-mono text-xs outline-none focus:border-signal"
          data-testid="filter-batch"
        >
          <option value="">All</option>
          {BATCHES.filter(Boolean).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="overline">BRANCH</span>
        <select
          value={branch}
          onChange={(e) => handleFilterChange(setBranch, "branch", e.target.value)}
          className="w-full border border-line bg-paper p-2 font-mono text-xs outline-none focus:border-signal"
          data-testid="filter-branch"
        >
          {BRANCHES.map((b) => (
            <option key={b || "all"} value={b}>
              {b || "All"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="overline">MIN CTC (LPA)</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={minCtc}
          onChange={(e) => handleFilterChange(setMinCtc, "minCtc", e.target.value)}
          placeholder="Min CTC (LPA)"
          className="w-full border border-line bg-paper p-2 font-mono text-base outline-none placeholder:text-subtle focus:border-signal md:text-sm"
          data-testid="filter-min-ctc"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="overline">SORT</span>
        <select
          value={sort}
          onChange={(e) => handleFilterChange(setSort, "sort", e.target.value)}
          className="w-full border border-line bg-paper p-2 font-mono text-xs outline-none focus:border-signal"
          data-testid="filter-sort"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="overline">PER PAGE</span>
        <select
          value={pageSize}
          onChange={(e) => handlePageSize(e.target.value)}
          className="w-full border border-line bg-paper p-2 font-mono text-xs outline-none focus:border-signal"
          data-testid="filter-page-size"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function MiniStat({ label, value, border, decimals = 0 }) {
  return (
    <div
      className={`px-5 py-4 ${border ? "border-l border-white/20" : ""}`}
    >
      <div className="font-display text-2xl font-black tracking-tighter md:text-3xl">
        <CountUp value={value} decimals={decimals} />
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
