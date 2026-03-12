import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // QuickBooks brand palette
        qb: {
          green: "#2CA01C",
          "green-dark": "#108000",
          "green-light": "#E6F5E4",
          charcoal: "#393A3D",
          slate: "#6B6C72",
          mist: "#BABEC5",
          cloud: "#F4F5F8",
          white: "#FFFFFF",
        },
        // DPP brand accents
        dpp: {
          primary: "#1A1A2E",
          accent: "#4361EE",
          "accent-light": "#EEF1FF",
          success: "#06D6A0",
          warning: "#FFD166",
          danger: "#EF476F",
        },
      },
      fontFamily: {
        sans: ['"Avenir Next"', '"AvenirNext-Regular"', "system-ui", "sans-serif"],
        display: ['"Avenir Next"', '"AvenirNext-DemiBold"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        qb: "8px",
      },
      boxShadow: {
        qb: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.04)",
        "qb-lg": "0 4px 12px 0 rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.06)",
        "qb-focus": "0 0 0 3px rgba(44,160,28,0.35)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-subtle": "pulseSubtle 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
