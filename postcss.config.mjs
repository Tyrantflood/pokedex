// Tailwind v4 via its PostCSS plugin, the integration Tailwind documents for Next.js.
//
// Do not swap this for the `@tailwindcss/turbopack` loader (as create-next-app generated in
// next.config.ts). In 4.3.3 that loader decides whether globals.css changed by comparing the
// file's mtime only. Turbopack sometimes runs it once with the *old* file content after the
// mtime has already moved on, which poisons that bookkeeping: the next call, with the new
// content, then reuses a compiler built from the old content and serves stale CSS until the
// file is touched again. This plugin also compares the CSS text itself, so it cannot go stale
// that way.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
