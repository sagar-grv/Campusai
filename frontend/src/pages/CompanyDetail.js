import React from "react";
import { toast } from "sonner";
import { useParams, Link } from "react-router-dom";
import {
  Briefcase,
  IndianRupee,
  Calendar,
  Layers,
  FileText,
  GraduationCap,
  Building2,
} from "lucide-react";
import { getCompany } from "../lib/api";

const BACKLOG_RE = /\b(backlog|kts?|arrears?)\b/i;

export default function CompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError(null);
    getCompany(id)
      .then((res) => {
        if (!active) return;
        setCompany(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        if (err?.response?.status === 404) {
          setNotFound(true);
          return;
        }
        toast.error("Failed to load company.");
        setError("Failed to load company.");
      });
    return () => {
      active = false;
    };
  }, [id]);

  const hasBacklogTerm = BACKLOG_RE.test(company?.eligibility || "");

  return (
    <div
      className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-12"
      data-testid="company-detail-page"
    >
      <div className="mb-8">
        <div className="overline">MODULE / 04B · COMPANY DETAIL</div>
        <Link
          to="/companies"
          className="overline mt-4 inline-block transition-colors hover:text-signal"
          data-testid="company-detail-back"
        >
          ← Companies
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4" aria-hidden="true" data-testid="company-detail-skeleton">
          <span className="skel h-3 w-32" />
          <span className="skel h-10 w-72 md:h-14 md:w-96" />
          <div className="border border-line bg-white">
            <div className="grid gap-4 p-5 md:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <span className="skel h-2 w-16" />
                  <span className="skel h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border border-line bg-white p-5">
              <span className="skel h-3 w-24" />
              <span className="skel mt-3 h-4 w-48" />
            </div>
            <div className="border border-line bg-white p-5">
              <span className="skel h-3 w-24" />
              <span className="skel mt-3 h-4 w-40" />
            </div>
          </div>
        </div>
      ) : notFound ? (
        <div className="sharp-card flex flex-col items-center p-12 text-center">
          <Building2 size={36} className="text-line" strokeWidth={1.5} />
          <p className="mt-4 font-display text-2xl font-black tracking-tighter">
            Company not found.
          </p>
          <p className="mt-1 text-sm text-muted">
            This record may have been removed or never existed.
          </p>
          <Link to="/companies" className="btn-outline mt-6">
            ← Back to Companies
          </Link>
        </div>
      ) : error ? (
        <div className="sharp-card flex flex-col items-center p-12 text-center">
          <Building2 size={36} className="text-line" strokeWidth={1.5} />
          <p className="mt-4 font-display text-2xl font-black tracking-tighter">{error}</p>
          <Link to="/companies" className="btn-outline mt-6">
            ← Back to Companies
          </Link>
        </div>
      ) : company ? (
        <div className="space-y-6 fade-up">
          <h1
            className="font-display text-3xl font-black tracking-tighter md:text-6xl"
            data-testid="company-detail-title"
          >
            {company.company || "—"}
          </h1>

          <div className="sharp-card p-6" data-testid="company-detail-facts">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Detail
                icon={<Briefcase size={14} className="text-signal" strokeWidth={1.5} />}
                label="ROLE"
                value={company.role}
              />
              <Detail
                icon={<IndianRupee size={14} className="text-signal" strokeWidth={1.5} />}
                label="CTC"
                value={company.ctc}
              />
              <Detail
                icon={<Calendar size={14} className="text-signal" strokeWidth={1.5} />}
                label="BATCH"
                value={company.batch}
              />
              <Detail
                icon={<Layers size={14} className="text-signal" strokeWidth={1.5} />}
                label="MODE"
                value={company.mode}
              />
              <Detail
                icon={<Calendar size={14} className="text-signal" strokeWidth={1.5} />}
                label="DATE"
                value={company.date}
              />
              <Detail
                icon={<FileText size={14} className="text-signal" strokeWidth={1.5} />}
                label="SOURCE"
                value={company.source_file}
              />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="sharp-card p-5" data-testid="company-detail-eligibility">
              <div className="overline mb-2">ELIGIBILITY</div>
              <p className="break-words text-sm text-muted [overflow-wrap:anywhere]">
                {company.eligibility || "—"}
              </p>
              {company.cgpa && (
                <span className="mt-3 inline-block bg-paper px-2 py-1 font-mono text-xs text-signal border border-line">
                  CGPA: {company.cgpa}
                </span>
              )}
            </div>

            <div className="sharp-card p-5" data-testid="company-detail-branches">
              <div className="flex items-center gap-1">
                <GraduationCap size={14} className="text-signal" strokeWidth={1.5} />
                <span className="overline">BRANCHES</span>
              </div>
              <p className="mt-1 break-words text-sm text-muted">{company.branches || "All branches"}</p>
            </div>

            <div className="sharp-card p-5" data-testid="company-detail-notes">
              <div className="overline mb-2">SELECTION PROCESS / NOTES</div>
              <p className="break-words text-sm text-muted">{company.notes || "—"}</p>
            </div>

            <div className="sharp-card p-5" data-testid="company-detail-backlog">
              <div className="overline mb-2">BACKLOG POLICY</div>
              <span
                className={`inline-block border px-2 py-1 font-mono text-[10px] uppercase tracking-widerX ${
                  hasBacklogTerm
                    ? "border-signal text-signal"
                    : "border-line text-muted"
                }`}
              >
                {hasBacklogTerm ? "BACKLOGS: DISALLOWED" : "BACKLOG POLICY: NOT SPECIFIED"}
              </span>
            </div>
          </div>
        </div>
      ) : null}
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
      <p className="mt-1 break-words text-sm">{value || "—"}</p>
    </div>
  );
}