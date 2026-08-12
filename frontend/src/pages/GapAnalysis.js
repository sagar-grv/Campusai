import React from "react";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  FileCheck,
} from "lucide-react";
import { parseResume, gapAnalysis } from "../lib/api";
import { CountUp, Stagger, StaggerItem } from "../components/motion";

const SAMPLE_JDS = [
  {
    title: "Goldman Sachs · Software Engineer",
    text: "Looking for a Software Engineer with strong expertise in Data Structures, Algorithms, C++, Java, Object Oriented Design, System Architecture, SQL databases, and Microservices. Candidates must have strong problem-solving skills, Git version control, and cloud awareness (AWS/GCP).",
  },
  {
    title: "Equity Data Science · Data Engineer",
    text: "Hiring Data Engineers with expertise in Python, SQL, PostgreSQL, PySpark, Data Pipeline Design, ETL workflows, pandas, REST APIs, Docker, and Git. Requires understanding of financial data models and analytics pipelines.",
  },
  {
    title: "Oracle · Associate Application Developer",
    text: "Seeking Associate Application Developers proficient in Java, Spring Boot, SQL, Oracle DB, RESTful Web Services, JavaScript, HTML5/CSS3, Unit Testing, and Agile methodologies. Knowledge of CI/CD and Docker is a plus.",
  },
  {
    title: "Tech Mahindra · Graduate Engineer Trainee",
    text: "Hiring GETs with knowledge of C/C++, Java, Python, Web Technologies (HTML/CSS/JS), Database Management Systems (SQL), Operating Systems, Software Engineering concepts, and good verbal communication skills.",
  },
];

const SAMPLE_RESUMES = [
  {
    title: "Software Engineering Student",
    text: "Sagar Verma | Computer Engineering Student | CGPA 8.2. Skills: Python, JavaScript, React.js, FastAPI, Node.js, HTML5, CSS3, SQL, MongoDB, Git. Projects: Campus AI Placement Assistant built with FastAPI and React; E-Commerce Web App with authentication and payment integration. Coursework: Data Structures, Algorithms, DBMS, OOP, Software Engineering.",
  },
  {
    title: "Data Science & Analytics Student",
    text: "Ananya Sharma | AI & Data Science Branch | CGPA 8.7. Skills: Python, SQL, pandas, NumPy, scikit-learn, Matplotlib, Tableau, Machine Learning, Data Visualization, MySQL. Projects: Predictive Sales Analytics Dashboard; Customer Churn Prediction using Logistic Regression and Random Forest.",
  },
];

export default function GapAnalysis() {
  const [file, setFile] = React.useState(null);
  const [resumeText, setResumeText] = React.useState("");
  const [jd, setJd] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [result, setResult] = React.useState(null);

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsing(true);
    try {
      const res = await parseResume(f);
      setResumeText(res.text);
      toast.success(`Parsed ${res.filename} (${res.chars} chars)`);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Could not parse resume.";
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  }

  async function handleAnalyze(e) {
    if (e) e.preventDefault();
    if (resumeText.length < 15) {
      toast.error("Resume text is too short. Upload a file or paste text.");
      return;
    }
    if (jd.length < 15) {
      toast.error("Job description is too short. Paste a JD or choose a sample.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await gapAnalysis(resumeText, jd);
      setResult(res);
      toast.success("Gap analysis complete!");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Analysis failed.";
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  }

  function scoreColor(s) {
    if (s >= 75) return "text-success";
    if (s >= 45) return "text-warning";
    return "text-error";
  }

  return (
    <div
      className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12"
      data-testid="gap-analysis-page"
    >
      <div className="mb-8">
        <div className="overline">MODULE / 02 · RESUME × JD</div>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tighter md:text-6xl">
          Gap Analysis.
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Upload your resume and paste a target job description. Get an honest match
          score, missing skills, and actionable steps to close the gap.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* LEFT – inputs */}
        <div className="md:col-span-5">
          <form onSubmit={handleAnalyze} className="space-y-5">
            {/* Quick pre-fill helpers */}
            <div className="sharp-card p-5 bg-paper">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="text-signal" size={16} />
                <span className="overline">QUICK DEMO PRE-FILLS</span>
              </div>
              <p className="text-xs text-muted mb-3">
                Click below to auto-fill sample resume & placement drive JD:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setResumeText(SAMPLE_RESUMES[0].text)}
                  className="border border-line bg-white px-2.5 py-1 font-mono text-[11px] hover:border-ink"
                >
                  + Software Resume
                </button>
                <button
                  type="button"
                  onClick={() => setResumeText(SAMPLE_RESUMES[1].text)}
                  className="border border-line bg-white px-2.5 py-1 font-mono text-[11px] hover:border-ink"
                >
                  + Data Resume
                </button>
              </div>
            </div>

            {/* File upload */}
            <div className="sharp-card p-5">
              <div className="overline mb-3">STEP 1 · UPLOAD RESUME</div>
              <label
                className="group flex cursor-pointer flex-col items-center gap-3 border border-dashed border-line p-6 transition-colors hover:border-signal hover:bg-paper"
                data-testid="resume-dropzone"
              >
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={handleFile}
                  data-testid="resume-file-input"
                />
                {parsing ? (
                  <Loader2
                    size={24}
                    className="animate-spin text-signal"
                    strokeWidth={1.5}
                  />
                ) : (
                  <Upload
                    size={24}
                    className="text-muted group-hover:text-signal"
                    strokeWidth={1.5}
                  />
                )}
                <span className="text-sm text-muted">
                  {file
                    ? file.name
                    : "Drop PDF, DOCX, or TXT — or click to browse"}
                </span>
              </label>
              {resumeText && (
                <div className="mt-3 flex items-center gap-2 font-mono text-xs text-success">
                  <CheckCircle2 size={14} strokeWidth={1.5} />
                  <span>{resumeText.length} characters loaded</span>
                </div>
              )}
            </div>

            {/* Resume text fallback */}
            <div className="sharp-card p-5">
              <div className="overline mb-3">OR · RESUME TEXT</div>
              <textarea
                className="w-full border border-line bg-white p-3 font-mono text-xs outline-none focus:border-signal"
                rows={5}
                placeholder="Paste your resume text here..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                data-testid="resume-text-input"
              />
            </div>

            {/* JD input & Sample Selector */}
            <div className="sharp-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="overline">STEP 2 · JOB DESCRIPTION</div>
              </div>
              <div className="mb-3">
                <select
                  onChange={(e) => {
                    const idx = e.target.value;
                    if (idx !== "") setJd(SAMPLE_JDS[idx].text);
                  }}
                  className="w-full border border-line bg-paper p-2 font-mono text-xs outline-none focus:border-signal mb-2"
                >
                  <option value="">-- Or choose placement drive JD --</option>
                  {SAMPLE_JDS.map((item, idx) => (
                    <option key={idx} value={idx}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className="w-full border border-line bg-white p-3 text-sm outline-none focus:border-signal"
                rows={7}
                placeholder="Paste the target job description here..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                data-testid="jd-input"
              />
            </div>

            <button
              type="submit"
              className="btn-signal w-full justify-center"
              disabled={analyzing}
              data-testid="analyze-button"
            >
              {analyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Analyzing Gap…
                </>
              ) : (
                <>
                  Analyze Gap <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT – results */}
        <div className="md:col-span-7" data-testid="gap-results">
          {!result && !analyzing && (
            <div className="sharp-card flex min-h-[420px] flex-col items-center justify-center p-10 text-center">
              <FileText
                size={36}
                className="text-line"
                strokeWidth={1.5}
              />
              <p className="mt-4 font-display text-2xl font-black tracking-tighter">
                Results appear here.
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Upload your resume, select or paste a JD, and click Analyze to generate your report.
              </p>
            </div>
          )}

          {analyzing && (
            <div className="sharp-card flex min-h-[420px] flex-col items-center justify-center p-10">
              <Loader2
                size={32}
                className="animate-spin text-signal"
                strokeWidth={1.5}
              />
              <p className="mt-4 font-mono text-xs uppercase tracking-widerX text-muted">
                Extracting Skills · Calculating Match
              </p>
            </div>
          )}

          {result && !analyzing && (
            <div className="space-y-6 fade-up">
              {/* Score header */}
              <div className="sharp-card flex items-center justify-between p-6">
                <div>
                  <div className="overline">MATCH SCORE</div>
                  <div
                    className={`font-display text-6xl font-black tracking-tighter ${scoreColor(
                      result.match_score
                    )}`}
                    data-testid="match-score"
                  >
                    <CountUp
                      value={result.match_score}
                      suffix="%"
                      decimals={0}
                      duration={1.2}
                    />
                  </div>
                </div>
                <div className="max-w-xs text-right text-xs text-muted">
                  {result.summary}
                </div>
              </div>

              {/* Matched & Missing skills */}
              <div className="grid gap-6 md:grid-cols-2">
                                <div className="sharp-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={16} className="text-success" />
                    <span className="overline">MATCHED SKILLS ({result.matched_skills.length})</span>
                  </div>
                  <Stagger className="flex flex-wrap gap-1.5" animate gap={0.03}>
                    {result.matched_skills.map((s, i) => (
                      <StaggerItem key={i}>
                        <span className="block bg-paper border border-line px-2.5 py-1 font-mono text-xs text-ink">
                          {s}
                        </span>
                      </StaggerItem>
                    ))}
                  </Stagger>
                  {result.matched_skills.length === 0 && (
                    <span className="text-xs text-muted">No direct skill matches found.</span>
                  )}
                </div>

                <div className="sharp-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle size={16} className="text-error" />
                    <span className="overline">MISSING SKILLS ({result.missing_skills.length})</span>
                  </div>
                  <Stagger className="flex flex-wrap gap-1.5" animate gap={0.03}>
                    {result.missing_skills.map((s, i) => (
                      <StaggerItem key={i}>
                        <span className="block bg-paper border border-line border-l-2 border-l-error px-2.5 py-1 font-mono text-xs text-ink">
                          {s}
                        </span>
                      </StaggerItem>
                    ))}
                  </Stagger>
                  {result.missing_skills.length === 0 && (
                    <span className="text-xs text-success">All required skills matched!</span>
                  )}
                </div>
              </div>

              {/* Actionable Improvements */}
              <div className="sharp-card p-6">
                <div className="overline mb-3">ACTIONABLE IMPROVEMENTS</div>
                <Stagger className="space-y-3" animate gap={0.07}>
                  {result.improvements.map((imp, i) => (
                    <StaggerItem
                      key={i}
                      className={i < result.improvements.length - 1 ? "border-b border-line" : ""}
                    >
                      <div className="flex items-start gap-3 pb-3 last:pb-0">
                        <span className="font-mono text-xs font-bold text-signal bg-ink text-white px-2 py-0.5">
                          0{i + 1}
                        </span>
                        <p className="text-sm text-ink leading-relaxed">{imp}</p>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
