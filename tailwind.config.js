const { heroui } = require("@heroui/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,mdx}",
    "./lib/**/*.{js,jsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-noto-thai)", "sans-serif"],
      },
    },
  },
  darkMode: "class",
  plugins: [heroui({ defaultTheme: "dark" })],
};
