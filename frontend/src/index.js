import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

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
