import React from "react";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sparkles,
  Search,
  X,
  IndianRupee,
  Briefcase,
  GraduationCap,
} from "lucide-react";
import { listCompanies, compareCompanies } from "../lib/api";
import FormattedMarkdown from "../components/FormattedMarkdown";
import { motion, AnimatePresence } from "motion/react";
import { Stagger, StaggerItem, FadeUp } from "../components/motion";

export default function Compare() {
  const [allCompanies, setAllCompanies] = React.useState([]);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [comparison, setComparison] = React.useState(null);

  React.useEffect(() => {
    listCompanies("").then((res) => {
      setAllCompanies(res.companies || []);
    });
  }, []);

  function toggleSelect(company) {
    const id = company.id || company.company;
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      if (selectedIds.length >= 4) {
        toast.error("You can compare at most 4 companies at once.");
        return;
      }
      setSelectedIds([...selectedIds, id]);
    }
  }

  async function handleCompare() {
    if (selectedIds.length < 2) {
      toast.error("Select at least 2 companies to compare.");
      return;
    }
    setLoading(true);
    try {
      const res = await compareCompanies(selectedIds);
      setComparison(res);
      toast.success("Comparison generated!");
    } catch (err) {
      toast.error("Failed to generate comparison.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = allCompanies.filter((c) =>
    (c.company || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12"
      data-testid="compare-page"
    >
      <div className="mb-8">
        <div className="overline">MODULE / 06 · SIDE-BY-SIDE COMPARISON</div>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
          Compare Drives.
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Select 2 to 4 companies to compare packages, eligibility strictness,
          branch allowances, and selection processes side-by-side.
        </p>
      </div>

      <div className="mb-8 sharp-card p-6">
        <div className="overline mb-3">SELECT COMPANIES TO COMPARE</div>
        <div className="chip-scroll flex items-center gap-2 overflow-x-auto mb-4">
          <AnimatePresence initial={false}>
            {selectedIds.map((id) => {
              const comp = allCompanies.find((c) => (c.id || c.company) === id);
              return (
                <motion.span
                  key={id}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                  className="inline-flex shrink-0 items-center gap-1.5 bg-ink text-white pl-4 pr-0 font-mono text-xs rounded-full min-h-[44px]"
                >
                  {comp?.company || id}
                  <button
                    onClick={() => toggleSelect(comp || { id })}
                    aria-label={`remove ${comp?.company || id}`}
                    className="flex w-11 self-stretch items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </motion.span>
              );
            })}
          </AnimatePresence>
          {selectedIds.length === 0 && (
            <span className="shrink-0 text-sm text-muted">
              No companies selected yet. Click companies below to select.
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 border border-line bg-paper px-3 py-2">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            placeholder="Search company name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-line border border-line bg-white">
          {filtered.slice(0, 30).map((c, i) => {
            const id = c.id || c.company;
            const isSel = selectedIds.includes(id);
            return (
              <button
                key={i}
                onClick={() => toggleSelect(c)}
                className={`flex w-full min-h-[44px] items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                  isSel ? "bg-paper font-bold text-signal" : "hover:bg-paper"
                }`}
              >
                <span>{c.company}</span>
                <span className="font-mono text-xs text-muted">
                  {c.ctc || "—"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCompare}
          disabled={loading || selectedIds.length < 2}
          className="btn-signal mt-4 w-full justify-center"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Comparing…
            </>
          ) : (
            <>
              Compare {selectedIds.length} Companies <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      {/* Comparison Matrix */}
      {comparison && (
        <div className="space-y-6 fade-up">
          {comparison.ai_comparison && (
            <FadeUp>
              <div className="w-full min-w-0 sharp-card border-l-4 border-l-signal p-6 bg-paper">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="text-signal" size={18} />
                  <span className="overline">AI COMPARATIVE INSIGHTS</span>
                </div>
                <FormattedMarkdown
                  content={comparison.ai_comparison}
                  className="text-sm break-words [overflow-wrap:anywhere]"
                />
              </div>
            </FadeUp>
          )}

          <Stagger animate gap={0.08}>
          <div className="mobile-only flex justify-end mb-2">
            <span className="overline text-muted" data-testid="compare-swipe-hint">SWIPE →</span>
          </div>
          <div className="overflow-x-auto border border-line bg-white" data-testid="compare-scroll-container">
            <table className="w-full text-left border-collapse min-w-[640px]" data-testid="compare-table">
              <thead>
                <tr className="border-b border-line bg-paper">
                  <th
                    data-testid="compare-sticky-col"
                    className="sticky left-0 z-10 p-4 font-mono text-xs uppercase tracking-widerX border-r border-line bg-paper min-w-[150px] shadow-[2px_0_0_rgba(0,0,0,0.06)] md:static md:shadow-none"
                  >
                    CRITERIA
                  </th>
                  {comparison.companies.map((c, i) => (
                    <th
                      key={i}
                      className="p-4 font-display text-base font-bold border-r border-line min-w-[220px]"
                    >
                      {c.company}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                <tr>
                  <td className="sticky left-0 z-10 p-4 font-mono text-xs text-muted border-r border-line bg-paper shadow-[2px_0_0_rgba(0,0,0,0.06)] md:static md:shadow-none">
                    CTC / PACKAGE
                  </td>
                  {comparison.companies.map((c, i) => (
                    <td key={i} className="p-4 font-mono font-bold text-signal border-r border-line">
                      {c.ctc || "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-10 p-4 font-mono text-xs text-muted border-r border-line bg-paper shadow-[2px_0_0_rgba(0,0,0,0.06)] md:static md:shadow-none">
                    ROLE(S)
                  </td>
                  {comparison.companies.map((c, i) => (
                    <td key={i} className="p-4 border-r border-line">
                      {c.role || "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-10 p-4 font-mono text-xs text-muted border-r border-line bg-paper shadow-[2px_0_0_rgba(0,0,0,0.06)] md:static md:shadow-none">
                    ELIGIBLE BRANCHES
                  </td>
                  {comparison.companies.map((c, i) => (
                    <td key={i} className="p-4 font-mono text-xs border-r border-line">
                      {c.branches || "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-10 p-4 font-mono text-xs text-muted border-r border-line bg-paper shadow-[2px_0_0_rgba(0,0,0,0.06)] md:static md:shadow-none">
                    ELIGIBILITY / CUTOFF
                  </td>
                  {comparison.companies.map((c, i) => (
                    <td key={i} className="p-4 border-r border-line text-muted">
                      {c.eligibility || c.cgpa || "No criteria specified"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 z-10 p-4 font-mono text-xs text-muted border-r border-line bg-paper shadow-[2px_0_0_rgba(0,0,0,0.06)] md:static md:shadow-none">
                    SELECTION PROCESS
                  </td>
                  {comparison.companies.map((c, i) => (
                    <td key={i} className="p-4 border-r border-line text-muted">
                      {c.notes || "Standard Interview Drive"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          </Stagger>
        </div>
      )}
    </div>
  );
}
