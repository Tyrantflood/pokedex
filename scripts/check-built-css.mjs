// Runs automatically after `npm run build` (the "postbuild" script).
//
// Fails the build if app/globals.css defines a class that is missing from the CSS that was
// actually built. A stale CSS build used to ship silently (new styles in the source, old styles
// in the output, no error anywhere); this turns that into a loud failure. If it ever fires, the
// fix for the build is `rm -rf .next` and rebuilding, but please also find out why.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const sourceFile = path.join(root, "app", "globals.css");
const builtDir = path.join(root, ".next", "static", "chunks");

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

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (!existsSync(builtDir)) {
    console.error(`check-built-css: ${builtDir} not found; did the build run?`);
    process.exit(1);
  }
  const built = readdirSync(builtDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(path.join(builtDir, f), "utf8"))
    .join("\n");
  const expected = selectorClasses(readFileSync(sourceFile, "utf8"));
  const missing = missingClasses(readFileSync(sourceFile, "utf8"), built);

  if (missing.length > 0) {
    console.error(`\ncheck-built-css: STALE CSS BUILD. ${missing.length} of ${expected.size} classes in app/globals.css are missing from the built CSS:`);
    console.error("  " + missing.slice(0, 15).map((c) => "." + c).join(" ") + (missing.length > 15 ? " ..." : ""));
    console.error("Delete .next and rebuild (rm -rf .next && npm run build), then work out why it went stale.\n");
    process.exit(1);
  }
  console.log(`check-built-css: ok (${expected.size} classes in app/globals.css all present in the built CSS)`);
}
