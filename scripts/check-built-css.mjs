// Runs automatically after `npm run build` (the "postbuild" script).
//
// Fails the build if app/globals.css defines a class that is missing from the CSS that was
// actually built. A stale CSS build used to ship silently (new styles in the source, old styles
// in the output, no error anywhere); this turns that into a loud failure. If it ever fires, the
// fix for the build is `rm -rf .next` and rebuilding, but please also find out why.
//
// Where the built CSS lives depends on where the build runs:
//   - locally, `next build` leaves it in .next/static;
//   - on Vercel, the build output is moved (Build Output API layout) before `postbuild` runs, so
//     it is no longer under .next/static by then.
// The check looks in all of those places. If it finds no CSS at all it fails locally (that means
// the build did not run) but only warns on Vercel, where it can't tell "output moved somewhere I
// don't know about" from "build is broken" and must not block a deploy over that. If it does find
// CSS, a missing class fails the build everywhere.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(root, "app", "globals.css");

/** Directories searched (recursively) for built .css files, in the order they are tried. */
const BUILT_CSS_DIRS = [
  path.join(root, ".next", "static"), // plain `next build`
  path.join(root, ".vercel", "output", "static"), // Vercel Build Output API, after the output is moved
];

/** Class names used in the selectors of a stylesheet (ignores declarations, comments and at-rule preludes). */
export function selectorClasses(css) {
  const classes = new Set();
  for (const [, rawPrelude] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)) {
    // A prelude can start with preceding statements such as `@import "x";`
    const prelude = rawPrelude.slice(rawPrelude.lastIndexOf(";") + 1).trim();
    if (prelude.startsWith("@")) continue;
    for (const m of prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(m[1]);
  }
  return classes;
}

export function missingClasses(sourceCss, builtCss) {
  return [...selectorClasses(sourceCss)].filter((name) => !new RegExp(`\\.${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![\\w-])`).test(builtCss));
}

/** Every .css file under `dir`, at any depth. Returns [] if the directory does not exist. */
export function cssFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...cssFilesUnder(full));
    else if (entry.endsWith(".css")) files.push(full);
  }
  return files;
}

const isVercel = Boolean(process.env.VERCEL);
const rel = (p) => path.relative(root, p) || ".";

function main() {
  const cssFiles = BUILT_CSS_DIRS.flatMap(cssFilesUnder);

  if (cssFiles.length === 0) {
    const searched = BUILT_CSS_DIRS.map(rel).join(", ");
    if (isVercel) {
      console.warn(
        `\ncheck-built-css: WARNING: no built CSS found (looked in: ${searched}), so the stale-CSS check was SKIPPED.\n` +
          "  On Vercel the build output is moved before postbuild runs. Local builds still run this check.\n",
      );
      return 0;
    }
    console.error(`\ncheck-built-css: no built CSS found (looked in: ${searched}). Did the build run?\n`);
    return 1;
  }

  const sourceCss = readFileSync(sourceFile, "utf8");
  const built = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n");
  const expected = selectorClasses(sourceCss);
  const missing = missingClasses(sourceCss, built);

  if (missing.length > 0) {
    console.error(`\ncheck-built-css: STALE CSS BUILD. ${missing.length} of ${expected.size} classes in app/globals.css are missing from the built CSS:`);
    console.error("  " + missing.slice(0, 15).map((c) => "." + c).join(" ") + (missing.length > 15 ? " ..." : ""));
    console.error("Delete .next and rebuild (rm -rf .next && npm run build), then work out why it went stale.\n");
    return 1;
  }
  console.log(`check-built-css: ok (${expected.size} classes in app/globals.css all present in ${cssFiles.length} built CSS file${cssFiles.length === 1 ? "" : "s"} under ${[...new Set(cssFiles.map((f) => rel(BUILT_CSS_DIRS.find((d) => f.startsWith(d)))))].join(", ")})`);
  return 0;
}

// Run only when executed directly, not when imported (the helpers above are exported for tests).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main());
}
