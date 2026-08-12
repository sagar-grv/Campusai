import React from "react";
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { Menu, X } from "lucide-react";
import { MotionConfig, motion, AnimatePresence, LayoutGroup } from "motion/react";
import { EASE } from "./components/motion";

import Landing from "./pages/Landing";
import Chat from "./pages/Chat";
import GapAnalysis from "./pages/GapAnalysis";
import InterviewPrep from "./pages/InterviewPrep";
import Companies from "./pages/Companies";
import Eligibility from "./pages/Eligibility";
import Compare from "./pages/Compare";
import CompanyDetail from "./pages/CompanyDetail";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[60vh] items-center justify-center px-5 py-16"
          data-testid="error-boundary"
        >
          <div className="sharp-card max-w-md p-8 text-center">
            <div className="overline text-signal">SYSTEM FAULT</div>
            <h1 className="mt-3 font-display text-3xl font-black tracking-tighter">
              Something went wrong.
            </h1>
            <p className="mt-3 text-sm text-muted">
              An unexpected error crashed this module. Your session is intact — reload to
              continue.
            </p>
            <button
              onClick={() => location.reload()}
              className="btn-signal mt-6 justify-center"
              data-testid="error-boundary-reload"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV = [
  { to: "/chat", label: "Ask" },
  { to: "/eligibility", label: "Eligibility" },
  { to: "/gap", label: "Gap Analysis" },
  { to: "/interview", label: "Interview Prep" },
  { to: "/companies", label: "Companies" },
  { to: "/compare", label: "Compare" },
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
          <span className="font-display text-lg font-black tracking-tighter text-ink">
            Campus<span className="text-signal">.AI</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="primary">
          <LayoutGroup>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.to.slice(1)}`}
                className={({ isActive }) =>
                  `relative overline px-3 py-2 transition-colors ${
                    isActive ? "text-ink font-bold" : "text-muted hover:text-ink"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {n.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-x-3 -bottom-px h-0.5 bg-signal"
                        transition={{ duration: 0.3, ease: EASE }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </LayoutGroup>
          <Link to="/chat" className="btn-signal ml-3 !py-2 !px-4 text-sm" data-testid="cta-nav-ask">
            Ask now
          </Link>
        </nav>
        <button
          className="md:hidden text-ink"
          onClick={() => setOpen((v) => !v)}
          aria-label="menu"
          data-testid="mobile-menu-toggle"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden border-t border-line bg-white md:hidden"
            data-testid="mobile-menu"
          >
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`mobile-nav-${n.to.slice(1)}`}
                className={({ isActive }) =>
                  `block border-b border-line px-5 py-4 font-display text-lg ${
                    isActive ? "bg-paper text-ink font-bold" : "text-muted"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-white text-ink">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-5 py-10 md:grid-cols-4 md:px-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 bg-ink" aria-hidden />
            <span className="font-display text-base font-black tracking-tighter text-ink">
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
            <li><Link to="/eligibility" className="hover:text-signal">Eligibility Checker</Link></li>
            <li><Link to="/gap" className="hover:text-signal">Resume Gap Analysis</Link></li>
            <li><Link to="/interview" className="hover:text-signal">Interview Prep</Link></li>
            <li><Link to="/companies" className="hover:text-signal">Company Explorer</Link></li>
            <li><Link to="/compare" className="hover:text-signal">Company Compare</Link></li>
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

function AnimatedRoutes() {
  const location = useLocation();
  const first = React.useRef(true);
  const skip = first.current;
  first.current = false;

  return (
    <div key={location.pathname} className={skip ? "" : "route-fade"}>
      <Routes location={location}>
        <Route path="/" element={<Landing />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/eligibility" element={<Eligibility />} />
        <Route path="/gap" element={<GapAnalysis />} />
        <Route path="/interview" element={<InterviewPrep />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/compare" element={<Compare />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <div className="flex min-h-screen flex-col bg-paper">
          <Nav />
          <main className="flex-1" data-testid="main-content">
            <ErrorBoundary>
              <AnimatedRoutes />
            </ErrorBoundary>
          </main>
          <Footer />
          <Toaster position="top-right" richColors closeButton />
        </div>
      </MotionConfig>
    </BrowserRouter>
  );
}

