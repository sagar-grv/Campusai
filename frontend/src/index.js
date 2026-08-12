import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const THEME_KEY = "campus-theme";

function resolveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

try {
  applyTheme(localStorage.getItem(THEME_KEY) || "system");
} catch {
  applyTheme("system");
}

// Suppress unhandled errors from third-party Chrome extensions (chrome-extension://)
window.addEventListener("error", (e) => {
  if (
    e.filename?.includes("chrome-extension://") ||
    e.message?.includes("M_ID") ||
    (e.error?.stack && e.error.stack.includes("chrome-extension"))
  ) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

window.addEventListener("unhandledrejection", (e) => {
  if (
    e.reason?.stack?.includes("chrome-extension") ||
    e.reason?.message?.includes("M_ID")
  ) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
