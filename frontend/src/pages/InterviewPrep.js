import React from "react";
import { toast } from "sonner";
import {
  Loader2,
  ArrowRight,
  Target,
  Lightbulb,
  Users,
  Code2,
} from "lucide-react";
import { interviewPrep } from "../lib/api";

export default function InterviewPrep() {
  const [jd, setJd] = React.useState("");
  const [missingSkills, setMissingSkills] = React.useState("");
  const [numQuestions, setNumQuestions] = React.useState(8);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (jd.length < 20) {
      toast.error("Job description is too short (min 20 chars).");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const payload = {
        job_description: jd,
        num_questions: numQuestions,
      };
      if (missingSkills.trim()) {
        payload.missing_skills = missingSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const res = await interviewPrep(payload);
      setResult(res);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Interview prep failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const totalQuestions =
    (result?.technical?.length || 0) + (result?.behavioral?.length || 0);

  return (
    <div
      className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12"
      data-testid="interview-prep-page"
    >
      <div className="mb-8">
        <div className="overline">MODULE / 03 · INTERVIEW PREP</div>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
          Practice with purpose.
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Paste a job description and your skill gaps. Get targeted technical and
          behavioral questions — with hints on how to answer each one.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* LEFT – form */}
        <div className="md:col-span-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="sharp-card p-5">
              <div className="overline mb-3">JOB DESCRIPTION</div>
              <textarea
                className="w-full border border-line bg-white p-3 text-sm outline-none focus:border-signal"
                rows={10}
                placeholder="Paste the full job description here..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                data-testid="ip-jd-input"
              />
            </div>

            <div className="sharp-card p-5">
              <div className="overline mb-3">MISSING SKILLS (OPTIONAL)</div>
              <textarea
                className="w-full border border-line bg-white p-3 font-mono text-xs outline-none focus:border-signal"
                rows={3}
                placeholder="e.g. Docker, Kubernetes, System Design — comma separated"
                value={missingSkills}
                onChange={(e) => setMissingSkills(e.target.value)}
                data-testid="ip-missing-skills-input"
              />
              <p className="mt-2 text-[11px] text-subtle">
                Tip: Copy missing skills from your Gap Analysis results for more
                targeted questions.
              </p>
            </div>

            <div className="sharp-card p-5">
              <div className="overline mb-3">NUMBER OF QUESTIONS</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="flex-1 accent-signal"
                  data-testid="ip-num-questions"
                />
                <span className="font-mono text-sm font-bold text-ink">
                  {numQuestions}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="btn-signal w-full justify-center"
              disabled={loading || jd.length < 20}
              data-testid="ip-generate-button"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Generating…
                </>
              ) : (
                <>
                  Generate questions <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT – results */}
        <div className="md:col-span-8" data-testid="ip-results">
          {!result && !loading && (
            <div className="sharp-card flex min-h-[420px] flex-col items-center justify-center p-10 text-center">
              <Target size={36} className="text-line" strokeWidth={1.5} />
              <p className="mt-4 font-display text-2xl font-black tracking-tighter">
                Questions appear here.
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Paste a JD and optionally add your missing skills to get
                targeted interview questions.
              </p>
            </div>
          )}

          {loading && (
            <div className="sharp-card flex min-h-[420px] flex-col items-center justify-center p-10">
              <Loader2
                size={32}
                className="animate-spin text-signal"
                strokeWidth={1.5}
              />
              <p className="mt-4 font-mono text-xs uppercase tracking-widerX text-muted">
                Generating {numQuestions} questions…
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4 fade-up">
              {/* Header */}
              <div className="sharp-card flex items-center justify-between p-5">
                <div>
                  <div className="overline mb-1">GENERATED</div>
                  <span className="font-display text-3xl font-black tracking-tighter">
                    {totalQuestions}{" "}
                    <span className="text-lg text-muted">questions</span>
                  </span>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <Code2 size={18} className="mx-auto text-signal" strokeWidth={1.5} />
                    <div className="mt-1 font-mono text-xs text-muted">
                      {result.technical?.length || 0} technical
                    </div>
                  </div>
                  <div className="text-center">
                    <Users size={18} className="mx-auto text-signal" strokeWidth={1.5} />
                    <div className="mt-1 font-mono text-xs text-muted">
                      {result.behavioral?.length || 0} behavioral
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical */}
              {result.technical?.length > 0 && (
                <div className="sharp-card">
                  <div className="flex items-center gap-2 border-b border-line bg-paper px-5 py-3">
                    <Code2 size={16} className="text-signal" strokeWidth={1.5} />
                    <span className="overline">TECHNICAL</span>
                  </div>
                  <div className="divide-y divide-line">
                    {result.technical.map((q, i) => (
                      <QuestionCard
                        key={i}
                        index={i + 1}
                        q={q}
                        type="technical"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Behavioral */}
              {result.behavioral?.length > 0 && (
                <div className="sharp-card">
                  <div className="flex items-center gap-2 border-b border-line bg-paper px-5 py-3">
                    <Users size={16} className="text-signal" strokeWidth={1.5} />
                    <span className="overline">BEHAVIORAL</span>
                  </div>
                  <div className="divide-y divide-line">
                    {result.behavioral.map((q, i) => (
                      <QuestionCard
                        key={i}
                        index={i + 1}
                        q={q}
                        type="behavioral"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ index, q, type }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="p-5" data-testid={`${type}-question-${index}`}>
      <button
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        data-testid={`${type}-toggle-${index}`}
      >
        <span className="mt-0.5 shrink-0 font-mono text-xs text-subtle">
          {String(index).padStart(2, "0")}
        </span>
        <span className="flex-1 text-sm font-semibold leading-snug">
          {q.question}
        </span>
        <span className="mt-0.5 shrink-0 text-subtle transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          →
        </span>
      </button>
      {open && (
        <div className="mt-3 ml-7 space-y-2 border-l-2 border-signal/30 pl-4 text-sm fade-up">
          <div>
            <span className="overline">WHY ASKED</span>
            <p className="mt-1 text-muted">{q.why_asked}</p>
          </div>
          <div className="flex items-start gap-2 rounded-sm bg-paper p-3">
            <Lightbulb
              size={14}
              className="mt-0.5 shrink-0 text-warning"
              strokeWidth={1.5}
            />
            <p className="text-xs text-muted">{q.hint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
