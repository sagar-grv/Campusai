import React from "react";
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import {
  Home,
  MessageSquare,
  Building2,
  GraduationCap,
  ArrowLeftRight,
  MoonStar,
  SunMedium,
} from "lucide-react";
import { MotionConfig, motion, LayoutGroup } from "motion/react";
import { EASE } from "./components/motion";

import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Companies from "./pages/Companies";
import Eligibility from "./pages/Eligibility";
import Compare from "./pages/Compare";
import CompanyDetail from "./pages/CompanyDetail";

const THEME_KEY = "campus-theme";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode) {
  return mode === "system" ? getSystemTheme() : mode;
}

function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

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
  { to: "/", label: "Dashboard" },
  { to: "/chat", label: "Ask" },
  { to: "/companies", label: "Companies" },
  { to: "/eligibility", label: "Eligibility" },
  { to: "/compare", label: "Compare" },
];

const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/chat", label: "Ask", icon: MessageSquare, primary: true },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/eligibility", label: "Eligibility", icon: GraduationCap },
  { to: "/compare", label: "Compare", icon: ArrowLeftRight },
];

function BottomNav() {
  const loc = useLocation();
  return (
    <nav
      className="tabbar-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-xl md:hidden"
      aria-label="mobile primary"
      data-testid="bottom-nav"
    >
      <div className="flex">
        {TABS.map((t) => {
          const active = loc.pathname === t.to;
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              data-testid={`tab-${t.to.slice(1) || "home"}`}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 ${
                active ? "text-ink" : "text-subtle"
              }`}
            >
              <Icon
                size={20}
                strokeWidth={1.75}
                className={active ? "text-signal" : ""}
              />
              <span
                className={`font-mono text-[9px] uppercase tracking-widerX ${
                  active ? "font-bold" : ""
                }`}
              >
                {t.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function AskFab() {
  const loc = useLocation();
  const navigate = useNavigate();
  if (loc.pathname === "/chat") return null;
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE, delay: 0.4 }}
      onClick={() => navigate("/chat")}
      aria-label="Ask the AI assistant"
      data-testid="ask-fab"
      className="fab-shadow mobile-only fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-signal text-white transition-transform active:scale-95 md:hidden"
    >
      <MessageSquare size={22} strokeWidth={2} />
    </motion.button>
  );
}

function Nav() {
  const [themeMode, setThemeMode] = React.useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || "system";
    } catch {
      return "system";
    }
  });

  React.useEffect(() => {
    applyTheme(themeMode);
    try {
      localStorage.setItem(THEME_KEY, themeMode);
    } catch {
      /* ignore */
    }
  }, [themeMode]);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if ((localStorage.getItem(THEME_KEY) || "system") === "system") {
          applyTheme("system");
        }
      } catch {
        applyTheme("system");
      }
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const resolved = resolveTheme(themeMode);
  const nextMode = themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system";
  const ThemeIcon = resolved === "dark" ? MoonStar : SunMedium;

  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-xl"
      data-testid="site-header"
    >
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-5 py-4 md:px-10">
        <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
          <span className="h-6 w-6 bg-ink" aria-hidden />
          <span className="font-display text-lg font-black tracking-tighter text-ink">
            Campus<span className="text-signal">.AI</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setThemeMode(nextMode)}
            className="btn-outline !px-3 !py-2 text-xs"
            aria-label={`Switch theme from ${themeMode}`}
            aria-pressed={resolved === "dark"}
            data-testid="theme-toggle"
            title={`Current: ${themeMode}`}
          >
            <ThemeIcon size={15} strokeWidth={1.8} />
            <span className="font-mono text-[10px] uppercase tracking-widerX">{themeMode}</span>
          </button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="primary">
            <LayoutGroup>
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  data-testid={`nav-${n.to.slice(1) || "home"}`}
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
        </div>
      </div>
    </header>
  );
}

function ThemeSync() {
  React.useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(THEME_KEY) || "system";
      } catch {
        return "system";
      }
    })();
    applyTheme(stored);
  }, []);

  return null;
}

function Footer() {
  return (
    <footer className="desktop-only mt-16 border-t border-line bg-white text-ink">
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
            <li><Link to="/" className="hover:text-signal">Dashboard</Link></li>
            <li><Link to="/chat" className="hover:text-signal">AI Assistant</Link></li>
            <li><Link to="/eligibility" className="hover:text-signal">Eligibility Checker</Link></li>
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
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/eligibility" element={<Eligibility />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <ThemeSync />
        <div className="flex min-h-screen flex-col bg-paper">
          <Nav />
          <main className="flex-1 pb-20 md:pb-0" data-testid="main-content">
            <ErrorBoundary>
              <AnimatedRoutes />
            </ErrorBoundary>
          </main>
          <Footer />
          <BottomNav />
          <AskFab />
          <Toaster position="top-right" richColors closeButton mobileToasts />
        </div>
      </MotionConfig>
    </BrowserRouter>
  );
}

