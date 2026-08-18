import type { Config } from "tailwindcss";

// Tailwind shares the app's EXISTING CSS-variable design tokens (defined in
// globals.css) so both the legacy CSS and new Tailwind/shadcn components draw
// from one palette — and dark mode "just works" because those vars already
// switch under prefers-color-scheme.
//
// Preflight (Tailwind's reset) is DISABLED during the migration so screens not
// yet converted keep their current styling; it gets turned on once every screen
// is migrated and the legacy CSS is removed.
const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        "card-2": "var(--card-2)",
        border: "var(--border)",
        muted: "var(--muted)",
        fg: "var(--text)",
        brand: {
          DEFAULT: "var(--brand)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
          soft: "var(--brand-soft)",
        },
        danger: "var(--danger)",
        success: "var(--success)",
        gold: "var(--gold)",
      },
      borderColor: { DEFAULT: "var(--border)" },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        soft: "var(--shadow)",
        lg: "var(--shadow-lg)",
        ring: "var(--ring)",
      },
      fontFamily: { sans: ["var(--font)"] },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "fade-in": "fade-in .2s ease",
        "slide-up": "slide-up .25s ease",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
