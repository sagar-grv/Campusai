import React from "react";
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { Menu, X } from "lucide-react";

import Landing from "./pages/Landing";
import Chat from "./pages/Chat";
import GapAnalysis from "./pages/GapAnalysis";
import InterviewPrep from "./pages/InterviewPrep";
import Companies from "./pages/Companies";

const NAV = [
  { to: "/chat", label: "Ask" },
  { to: "/gap", label: "Gap Analysis" },
  { to: "/interview", label: "Interview Prep" },
  { to: "/companies", label: "Companies" },
];

function Nav() {
  const [open, setOpen] = React.useState(false);
  const loc = useLocation();
  React.useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-xl"
      data-testid="site-header"
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 md:px-10">
        <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
          <span className="h-6 w-6 bg-ink" aria-hidden />
          <span className="font-display text-lg font-black tracking-tighter">
            Campus<span className="text-signal">.AI</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="primary">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.to.slice(1)}`}
              className={({ isActive }) =>
                `overline px-3 py-2 transition-colors ${
                  isActive ? "text-ink" : "text-muted hover:text-ink"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
          <Link to="/chat" className="btn-signal ml-3 !py-2 !px-4 text-sm" data-testid="cta-nav-ask">
            Ask now
          </Link>
        </nav>
        <button
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="menu"
          data-testid="mobile-menu-toggle"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-white md:hidden" data-testid="mobile-menu">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`mobile-nav-${n.to.slice(1)}`}
              className={({ isActive }) =>
                `block border-b border-line px-5 py-4 font-display text-lg ${
                  isActive ? "bg-paper text-ink" : "text-muted"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-5 py-10 md:grid-cols-4 md:px-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 bg-ink" aria-hidden />
            <span className="font-display text-base font-black tracking-tighter">
              Campus<span className="text-signal">.AI</span>
            </span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted">
            Grounded placement intelligence for engineering students. Powered by RAG so the answer
            you get is the answer that exists.
          </p>
        </div>
        <div>
          <p className="overline mb-3">Features</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/chat" className="hover:text-signal">Placement Assistant</Link></li>
            <li><Link to="/gap" className="hover:text-signal">Resume Gap Analysis</Link></li>
            <li><Link to="/interview" className="hover:text-signal">Interview Prep</Link></li>
            <li><Link to="/companies" className="hover:text-signal">Company Explorer</Link></li>
          </ul>
        </div>
        <div>
          <p className="overline mb-3">Built with</p>
          <ul className="space-y-2 font-mono text-xs text-muted">
            <li>FastAPI · MongoDB</li>
            <li>Gemini · Embeddings 001</li>
            <li>RAG + Cosine Similarity</li>
            <li>React · Tailwind</li>
          </ul>
        </div>
        <div>
          <p className="overline mb-3">Anti-Hallucination</p>
          <p className="text-sm text-muted">
            If it's not in the placement DB, it says "I don't know". No invented salaries. No fake
            eligibility criteria.
          </p>
        </div>
      </div>
      <div className="border-t border-line px-5 py-4 text-center font-mono text-[10px] uppercase tracking-widerX text-subtle md:px-10">
        © {new Date().getFullYear()} Campus AI · A student-first placement companion
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-paper">
        <Nav />
        <main className="flex-1" data-testid="main-content">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/gap" element={<GapAnalysis />} />
            <Route path="/interview" element={<InterviewPrep />} />
            <Route path="/companies" element={<Companies />} />
          </Routes>
        </main>
        <Footer />
        <Toaster position="top-right" richColors closeButton />
      </div>
    </BrowserRouter>
  );
}
