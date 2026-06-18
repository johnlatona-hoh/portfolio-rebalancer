/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#1c1c1e",
        card: "#2c2c2e",
        border: "#3a3a3c",
        accent: "#6b8cba",
        "accent-hover": "#5a7aaa",
        muted: "#8e8e93",
        good: "#4caf7d",
        warn: "#d8a657",
        bad: "#d16a6a",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
