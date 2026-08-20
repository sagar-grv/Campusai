import React from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  GraduationCap,
  MessageSquare,
} from "lucide-react";
import { useDashboard } from "../lib/swr";
import { CountUp, FadeUp, Stagger, StaggerItem } from "../components/motion";

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

const MODULES = [
  {
    to: "/chat",
    icon: <MessageSquare size={18} strokeWidth={1.5} />,
    title: "AI Assistant",
    tag: "Module / 01",
    testid: "dash-link-chat",
  },
  {
    to: "/eligibility",
    icon: <GraduationCap size={18} strokeWidth={1.5} />,
    title: "Eligibility Checker",
    tag: "Module / 05",
    testid: "dash-link-eligibility",
  },
  {
    to: "/companies",
    icon: <Building2 size={18} strokeWidth={1.5} />,
    title: "Company Explorer",
    tag: "Module / 04",
    testid: "dash-link-companies",
  },
  {
    to: "/compare",
    icon: <ArrowLeftRight size={18} strokeWidth={1.5} />,
    title: "Company Compare",
    tag: "Module / 06",
    testid: "dash-link-compare",
  },
];

export default function Dashboard() {
  const { data, error, isLoading } = useDashboard();
  const [reduced] = React.useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const loading = isLoading;
  const anim = !reduced;

  const byBatch = data?.by_batch ?? [];
  const topRecruiters = data?.top_recruiters ?? [];
  const topRoles = data?.top_roles ?? [];
  const ctcBuckets = data?.ctc_buckets ?? [];

  const topBatch = byBatch.length
    ? byBatch.reduce((a, b) => (b.count > a.count ? b : a), byBatch[0])
    : null;

  return (
    <div data-testid="dashboard-page" aria-busy={loading}>
      {/* HEADER */}
      <header className="border-b border-line bg-paper" data-testid="dash-hero">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-6 px-5 py-10 md:flex-row md:items-end md:justify-between md:px-10 md:py-14">
          <div className="max-w-2xl">
            <div className="overline mb-3">Campus · AI · Placement command center</div>
            <h1 className="font-display text-4xl font-black leading-[0.95] tracking-tighter text-ink md:text-6xl">
              Every drive. Indexed.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted md:text-base">
              Your placement season at a glance — company counts, CTCs and roles grounded in
              the actual placement database, not guesswork.
            </p>
          </div>
          <Link to="/chat" className="btn-signal shrink-0" data-testid="dash-cta">
            Ask the assistant <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>

      {/* STAT CARDS */}
      <section className="border-b border-line bg-paper" data-testid="dash-stats">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-3 px-5 py-6 md:grid-cols-4 md:gap-4 md:px-10 md:py-8">
          <StatCard
            loading={loading}
            error={error}
            testid="dash-stat-total"
            label="Total companies"
            value={data?.total_companies ?? 0}
          />
          <StatCard
            loading={loading}
            error={error}
            testid="dash-stat-avg"
            label="Avg CTC (LPA)"
            value={data?.avg_ctc_lpa ?? 0}
            decimals={1}
          />
          <StatCard
            loading={loading}
            error={error}
            testid="dash-stat-max"
            label="Max CTC (LPA)"
            value={data?.max_ctc_lpa ?? 0}
            decimals={1}
          />
          <StatCard
            loading={loading}
            error={error}
            testid="dash-stat-batch"
            label={topBatch ? `${topBatch.batch} drives` : "Batches"}
            value={topBatch?.count ?? 0}
          />
        </div>
      </section>

      {/* CHARTS */}
      <section className="border-b border-line bg-paper" data-testid="dash-charts">
        <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12">
          <FadeUp className="mb-8">
            <div className="overline">Live from the database</div>
            <h2 className="mt-2 font-display text-3xl font-black tracking-tighter md:text-5xl">
              The placement picture.
            </h2>
          </FadeUp>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ChartCard
              title="Companies by batch"
              testid="dash-chart-batch"
              loading={loading}
              empty={!byBatch.length}
            >
              <BarChart data={byBatch}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="batch" tick={TICK} />
                <YAxis tick={TICK} width={30} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
                <Bar
                  dataKey="count"
                  fill="#0a0a0a"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={anim}
                />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Top recruiters"
              testid="dash-chart-recruiters"
              loading={loading}
              empty={!topRecruiters.length}
            >
              <BarChart data={topRecruiters} layout="vertical">
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={TICK} allowDecimals={false} />
                <YAxis type="category" dataKey="company" width={90} tick={TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
                <Bar dataKey="count" fill="#ff4d00" isAnimationActive={anim} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Role distribution"
              testid="dash-chart-roles"
              loading={loading}
              empty={!topRoles.length}
            >
              <BarChart data={topRoles}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="role"
                  tick={TICK}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={52}
                />
                <YAxis tick={TICK} width={30} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
                <Bar dataKey="count" fill="#0a0a0a" isAnimationActive={anim} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="CTC distribution"
              testid="dash-chart-ctc"
              loading={loading}
              empty={!ctcBuckets.length}
            >
              <BarChart data={ctcBuckets}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="range" tick={TICK} interval={0} />
                <YAxis tick={TICK} width={30} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
                <Bar dataKey="count" fill="#0a0a0a" isAnimationActive={anim} />
              </BarChart>
            </ChartCard>
          </div>
        </div>
      </section>

      {/* MODULE QUICK LINKS */}
      <section className="border-b border-line bg-paper" data-testid="dash-modules">
        <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12">
          <FadeUp className="mb-8">
            <div className="overline">The toolkit / 04</div>
            <h2 className="mt-2 font-display text-3xl font-black tracking-tighter md:text-5xl">
              Go deeper.
            </h2>
          </FadeUp>
          <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" gap={0.06}>
            {MODULES.map((m) => (
              <StaggerItem key={m.to} className="border border-line bg-white p-4 md:p-5">
                <Link to={m.to} data-testid={m.testid} className="group block h-full">
                  <div className="flex items-start justify-between">
                    <span className="text-signal">{m.icon}</span>
                    <span className="text-muted transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal">
                      <ArrowUpRight size={18} strokeWidth={1.5} />
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-xl font-black tracking-tighter md:text-2xl">
                    {m.title}
                  </h3>
                  <p className="overline mt-2">{m.tag}</p>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* GROUNDED CLAIMS STRIP */}
      <section className="border-t border-line bg-ink" data-testid="dash-grounded">
        <div className="mx-auto max-w-[1400px] px-5 py-4 md:px-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
            RAG grounded · Cites sources · Refuses to guess
          </p>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, decimals = 0, loading, error, testid }) {
  return (
    <div className="border border-line bg-white p-4 md:p-5" data-testid={testid}>
      {loading ? (
        <div className="space-y-2">
          <span className="skel h-7 w-14" />
          <span className="skel h-2 w-20" />
        </div>
      ) : (
        <>
          <div className="font-display text-3xl font-black tracking-tighter text-ink md:text-5xl">
            {error ? "—" : <CountUp value={value} decimals={decimals} />}
          </div>
          <div className="overline mt-2">{label}</div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, testid, loading, empty, children }) {
  return (
    <div className="border border-line bg-white p-4 md:p-5" data-testid={testid}>
      <div className="overline mb-4">{title}</div>
      {loading ? (
        <span className="skel block h-[240px] w-full" />
      ) : empty ? (
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
