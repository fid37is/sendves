import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "#ffffff",
        /* Deep navy replaces pure black everywhere. */
        navy: { DEFAULT: "#0B1233", 950: "#070B22", 900: "#0B1233", 800: "#141C45", 700: "#222B5C" },
        ink: { DEFAULT: "#0B1233", soft: "#3A4263", muted: "#6B7290" },
        night: "#0B1233",
        spark: "#FBBF24",
        /* Pale lavender: borders, subtle surfaces and the toast accent. */
        lavender: { DEFAULT: "#E4DCEF", 50: "#FAF8FD", 100: "#F3EFF8", 200: "#E4DCEF", 300: "#D3C7E3" },
        /* Primary red. 700 is the primary (#ff0000); 800 is its hover state. */
        brand: {
          DEFAULT: "#FF0000",
          50: "#FFF1F1",
          100: "#FFE0E0",
          200: "#FFC2C2",
          400: "#FF6B6B",
          500: "#FF3D3D",
          600: "#FF1A1A",
          700: "#FF0000",
          800: "#D90000",
          900: "#A30000",
        },
        mist: { DEFAULT: "#E4DCEF", 50: "#FAF8FD", 100: "#F3EFF8" },
        success: "#15803D",
        warning: "#A16207",
        danger: "#D90000",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { "4xl": "2rem" },
      maxWidth: { page: "94rem" },
      /* Keyframes live in globals.css so they are always available to plain CSS too. */
      animation: {
        rise: "rise .8s cubic-bezier(.2,.7,.2,1) both",
        "rise-fast": "rise .35s cubic-bezier(.2,.7,.2,1) both",
        drift: "drift 14s linear infinite",
        bob: "bob 5s ease-in-out infinite",
        blink: "blink 1s steps(1) infinite",
        "slide-in-right": "slide-in-right .3s cubic-bezier(.2,.8,.2,1) both",
        "slide-in-left": "slide-in-left .3s cubic-bezier(.2,.8,.2,1) both",
        "fade-in": "fade-in .25s ease-out both",
        pop: "pop .5s cubic-bezier(.2,.9,.3,1.4) both",
        "toast-in": "toast-in .28s cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
