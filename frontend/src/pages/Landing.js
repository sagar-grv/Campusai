import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Sparkles, ShieldCheck, Terminal, Building2, FileText, Target } from "lucide-react";
import { motion } from "motion/react";
import { getStats } from "../lib/api";
import { EASE, Stagger, StaggerItem, FadeUp, CountUp, Marquee } from "../components/motion";

const HERO_IMG =
  "https://images.unsplash.com/photo-1637589308599-3478cc55510d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwyfHxpbmRpYW4lMjBjb2xsZWdlJTIwc3R1ZGVudCUyMGxhcHRvcHxlbnwwfHx8fDE3ODY0MzkzMzl8MA&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  {
    icon: <Terminal size={18} strokeWidth={1.5} />,
    title: "Placement Assistant",
    desc: "Ask anything about your college's placement drives. Grounded RAG answers with citations. No hallucinations.",
    to: "/chat",
    testid: "feature-chat",
    tag: "FEATURE / 01",
  },
  {
    icon: <FileText size={18} strokeWidth={1.5} />,
    title: "Resume × JD Gap Analysis",
    desc: "Drop your resume, paste a JD. Get an honest match score, missing skills, and concrete steps to close the gap.",
    to: "/gap",
    testid: "feature-gap",
    tag: "FEATURE / 02",
  },
  {
    icon: <Target size={18} strokeWidth={1.5} />,
    title: "Targeted Interview Prep",
    desc: "Questions generated from the JD & your specific gaps. Technical + behavioural, with hints on how to answer.",
    to: "/interview",
    testid: "feature-interview",
    tag: "FEATURE / 03",
  },
  {
    icon: <Building2 size={18} strokeWidth={1.5} />,
    title: "Company Explorer",
    desc: "115+ placement records across 2023-24 and 2025 batches. Filter by CTC, role, branch, eligibility.",
    to: "/companies",
    testid: "feature-companies",
    tag: "FEATURE / 04",
  },
];

const TICKER_FALLBACK = [
  "2025 BATCH",
  "2023-24 BATCH",
  "RAG GROUNDED",
  "CITES SOURCES",
  "NO FABRICATED SALARIES",
  "NO FAKE ELIGIBILITY",
];

const heroItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

export default function Landing() {
  const [stats, setStats] = React.useState(null);

  React.useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  const ticker = stats?.top_roles?.length
    ? [
        ...stats.top_roles.slice(0, 5).map((r) => `ROLE · ${r}`),
        "CITED ANSWERS",
        "GROUNDED IN TRUTH",
      ]
    : TICKER_FALLBACK;

  return (
    <div data-testid="landing-page">
      {/* HERO */}
      <section className="grain border-b border-line bg-paper">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-12 md:grid-cols-12 md:gap-8 md:px-10 md:py-20">
          <div className="md:col-span-7">
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
              }}
            >
              <motion.div variants={heroItem} data-testid="hero-overline">
                <div className="overline mb-6">
                  CAMPUS · AI · BUILT ON A REAL PLACEMENT DATABASE
                </div>
              </motion.div>
              <motion.h1
                variants={heroItem}
                className="font-display text-[44px] font-black leading-[0.95] tracking-tighter text-ink md:text-[88px]"
                data-testid="hero-title"
              >
                Your placement season,
                <br />
                <span className="text-signal">grounded in truth.</span>
              </motion.h1>
              <motion.p
                variants={heroItem}
                className="mt-6 max-w-xl font-body text-base leading-relaxed text-muted md:text-lg"
                data-testid="hero-subtitle"
              >
                A student-first assistant that answers only from your college's placement data,
                audits your resume against real job descriptions, and generates the exact interview
                questions you're missing prep for.
              </motion.p>
              <motion.div
                variants={heroItem}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Link to="/chat" className="btn-signal" data-testid="cta-primary">
                  Start asking <ArrowUpRight size={16} />
                </Link>
                <Link to="/gap" className="btn-outline" data-testid="cta-secondary">
                  Analyze my resume
                </Link>
              </motion.div>
              <motion.div
                variants={heroItem}
                className="mt-10 flex items-center gap-3 text-sm text-muted"
                data-testid="hero-trust"
              >
                <ShieldCheck size={16} className="text-success" strokeWidth={1.5} />
                <span className="font-mono text-xs uppercase tracking-widerX">
                  RAG grounded · Cites sources · Refuses to guess
                </span>
              </motion.div>
            </motion.div>
          </div>
          <div className="md:col-span-5">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.32 }}
              className="relative overflow-hidden border border-ink shadow-hardLg"
              data-testid="hero-image"
            >
              <motion.img
                src={HERO_IMG}
                alt="Indian college student working on placement prep"
                initial={{ scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.4, ease: EASE }}
                className="h-[380px] w-full object-cover md:h-[520px]"
              />
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-ink bg-white/95 px-4 py-3 font-mono text-[11px] uppercase tracking-widerX">
                <span>SESSION · LIVE</span>
                <span className="flex items-center gap-1 text-signal">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" /> retrieving
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="overflow-hidden border-b border-line bg-ink py-3" data-testid="ticker-strip">
        <Marquee items={ticker} />
      </div>

      {/* STATS */}
      {stats && (
        <section className="border-b border-line bg-ink text-white" data-testid="stats-strip">
          <div className="mx-auto grid max-w-[1400px] grid-cols-2 divide-x divide-white/20 px-5 md:grid-cols-4 md:px-10">
            <Stat label="Companies indexed" value={stats.total_companies} testid="stat-companies" />
            <Stat label="Avg CTC (LPA)" value={stats.avg_ctc_lpa} decimals={1} testid="stat-avg" />
            <Stat label="Max CTC (LPA)" value={stats.max_ctc_lpa} decimals={1} testid="stat-max" />
            <Stat
              label="Roles catalogued"
              value={stats.top_roles?.length || 0}
              testid="stat-roles"
            />
          </div>
        </section>
      )}

      {/* FEATURES */}
      <section className="border-b border-line" data-testid="features-section">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-10 md:py-24">
          <FadeUp className="mb-10 flex items-end justify-between">
            <div>
              <div className="overline">The Toolkit / 04</div>
              <h2 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
                Four moves. Zero fluff.
              </h2>
            </div>
            <Sparkles size={28} className="hidden md:block text-signal" strokeWidth={1.5} />
          </FadeUp>
          <Stagger className="grid grid-cols-1 border border-line md:grid-cols-2" gap={0.07}>
            {FEATURES.map((f, i) => (
              <StaggerItem
                key={f.title}
                className={`relative block bg-white p-6 transition-colors hover:bg-paper md:p-10 ${
                  i % 2 === 0 ? "md:border-r md:border-line" : ""
                } ${i < 2 ? "border-b border-line" : ""}`}
              >
                <Link
                  to={f.to}
                  data-testid={f.testid}
                  className="group block"
                >
                  <div className="flex items-start justify-between">
                    <span className="overline">{f.tag}</span>
                    <span className="inline-flex text-muted transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-signal">
                      <ArrowUpRight size={20} strokeWidth={1.5} />
                    </span>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-signal">{f.icon}</div>
                  <h3 className="mt-3 font-display text-2xl font-black tracking-tighter md:text-3xl">
                    {f.title}
                  </h3>
                  <p className="mt-3 max-w-md text-sm text-muted md:text-base">{f.desc}</p>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-b border-line bg-paper" data-testid="how-section">
        <div className="mx-auto max-w-[1400px] px-5 py-16 md:px-10 md:py-24">
          <FadeUp>
            <div className="overline">How grounding works / 03</div>
            <h2 className="mt-2 max-w-3xl font-display text-4xl font-black tracking-tighter md:text-6xl">
              We refuse to guess. On purpose.
            </h2>
          </FadeUp>
          <Stagger className="mt-10 grid grid-cols-1 gap-0 border border-line md:grid-cols-3" gap={0.1}>
            {[
              {
                n: "01",
                t: "Embed & Store",
                d: "Every company record is embedded with Gemini's embedding-001 and stored in MongoDB as a unit-normalised vector.",
              },
              {
                n: "02",
                t: "Retrieve",
                d: "Your question becomes a vector too. Cosine similarity pulls the top matches from the placement DB — no external knowledge involved.",
              },
              {
                n: "03",
                t: "Ground or Refuse",
                d: "If the similarity is too weak, we hand you an honest \"I don't know\". If it's strong, Gemini answers strictly within the retrieved context and cites sources.",
              },
            ].map((s, i) => (
              <StaggerItem
                key={s.n}
                className={`bg-white p-8 ${i < 2 ? "border-b border-line md:border-b-0 md:border-r" : ""}`}
                data-testid={`how-step-${s.n}`}
              >
                <div className="font-mono text-4xl font-light text-signal">{s.n}</div>
                <h3 className="mt-4 font-display text-2xl font-black tracking-tighter">{s.t}</h3>
                <p className="mt-2 text-sm text-muted">{s.d}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink" data-testid="cta-section">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-6 px-5 py-16 text-white md:flex-row md:items-center md:justify-between md:px-10 md:py-20">
          <FadeUp>
            <h2 className="max-w-2xl font-display text-3xl font-black tracking-tighter md:text-5xl">
              Stop scrolling PDFs. Start shipping applications.
            </h2>
          </FadeUp>
          <FadeUp delay={0.1} className="flex gap-3">
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-signal px-6 py-3 font-semibold text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-95"
              data-testid="cta-final-ask"
            >
              Ask the assistant <ArrowUpRight size={16} />
            </Link>
            <Link
              to="/gap"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 font-semibold text-white transition-colors duration-200 ease-out hover:bg-white hover:text-ink active:scale-95"
              data-testid="cta-final-gap"
            >
              Analyze resume
            </Link>
          </FadeUp>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, decimals = 0, testid }) {
  return (
    <div className="px-5 py-6 md:px-8 md:py-8" data-testid={testid}>
      <div className="font-display text-4xl font-black tracking-tighter md:text-6xl">
        <CountUp value={value} decimals={decimals} />
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-widerX text-white/60">{label}</div>
    </div>
  );
}
