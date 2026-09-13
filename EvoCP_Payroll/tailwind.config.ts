import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 20px 60px rgba(0, 0, 0, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
