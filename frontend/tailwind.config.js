/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cabinet Grotesk"', '"Outfit"', "sans-serif"],
        body: ['"Satoshi"', '"IBM Plex Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"Source Code Pro"', "monospace"],
      },
      colors: {
        ink: "#0A0A0A",
        paper: "#F4F4F0",
        surface: "#FFFFFF",
        muted: "#525252",
        subtle: "#8A8A8A",
        line: "#D4D4D4",
        signal: "#FF4D00",
        signalHover: "#CC3D00",
        success: "#009E5A",
        warning: "#F5A623",
        error: "#D0021B",
      },
      boxShadow: {
        hard: "2px 2px 0px #0A0A0A",
        hardLg: "4px 4px 0px #0A0A0A",
      },
      letterSpacing: {
        widerX: "0.18em",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
