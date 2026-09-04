import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0A0A0A",
          soft: "#111111",
          card: "#161616",
          border: "#242424",
        },
        accent: {
          DEFAULT: "#FACC15",
          soft: "#FDE68A",
          deep: "#CA8A04",
        },
        wordle: {
          correct: "#FACC15",
          present: "#78716C",
          absent: "#1F1F1F",
          empty: "#161616",
          edge: "#2A2A2A",
        },
      },
      fontFamily: {
        display: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(250, 204, 21, 0.25)",
        pill: "0 2px 12px rgba(0,0,0,0.4)",
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        flip: {
          "0%": { transform: "rotateX(0)" },
          "50%": { transform: "rotateX(90deg)" },
          "100%": { transform: "rotateX(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
      },
      animation: {
        drift: "drift 4s ease-in-out infinite",
        flip: "flip 0.55s ease-in-out",
        shake: "shake 0.35s ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
