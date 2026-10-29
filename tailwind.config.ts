import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { palette } from "./src/config/brand";

type Tree = string | { [key: string]: Tree };

const hexToChannels = (hex: string): string => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
};

/** { brand: { 700: "#164E63" } } -> { "--c-brand-700": "22 78 99" } */
function cssVars(name: string, tree: Tree, out: Record<string, string> = {}): Record<string, string> {
  if (typeof tree === "string") {
    out[`--c-${name}`] = hexToChannels(tree);
  } else {
    for (const [key, value] of Object.entries(tree)) cssVars(key === "DEFAULT" ? name : `${name}-${key}`, value, out);
  }
  return out;
}

/** Same shape, but each leaf becomes an rgb(var(--c-…) / <alpha-value>) colour so opacity utilities work. */
function colorTree(name: string, tree: Tree): Tree {
  if (typeof tree === "string") return `rgb(var(--c-${name}) / <alpha-value>)`;
  return Object.fromEntries(Object.entries(tree).map(([key, value]) => [key, colorTree(key === "DEFAULT" ? name : `${name}-${key}`, value)]));
}

const vars: Record<string, string> = {};
const colors: Record<string, Tree> = {};
for (const [name, tree] of Object.entries(palette)) {
  cssVars(name, tree as Tree, vars);
  colors[name] = colorTree(name, tree as Tree);
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { white: "#ffffff", ...colors } as Record<string, any>,
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
  plugins: [
    // Publishes the palette as CSS variables on :root. A future dark theme only needs another block here.
    plugin(({ addBase }) => {
      addBase({ ":root": vars });
    }),
  ],
};

export default config;
