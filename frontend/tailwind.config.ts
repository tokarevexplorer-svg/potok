import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F5F0",
        surface: "#FFFFFF",
        elevated: "#FAFAF7",
        ink: {
          DEFAULT: "#1A1917",
          muted: "#6F6B64",
          faint: "#9A968E",
        },
        line: {
          DEFAULT: "#E8E4DC",
          strong: "#D8D3C8",
        },
        accent: {
          DEFAULT: "#FF5B1F",
          hover: "#E6500F",
          soft: "#FFEDE4",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.2rem" }],
        sm: ["0.875rem", { lineHeight: "1.35rem" }],
        base: ["1rem", { lineHeight: "1.55rem" }],
        lg: ["1.125rem", { lineHeight: "1.7rem" }],
        xl: ["1.375rem", { lineHeight: "1.85rem" }],
        "2xl": ["1.75rem", { lineHeight: "2.1rem" }],
        "3xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "4xl": ["3rem", { lineHeight: "3.2rem" }],
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 0 rgba(26, 25, 23, 0.03), 0 2px 8px rgba(26, 25, 23, 0.04)",
        pop: "0 8px 28px rgba(26, 25, 23, 0.08)",
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
