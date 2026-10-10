import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Maps "@/lib/x" and "./x" (no extension) to the real .ts/.tsx file; everything else is left to Node. */
export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && !/\.\w+$/.test(specifier)) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    for (const extension of EXTENSIONS) {
      if (existsSync(base + extension)) return nextResolve(pathToFileURL(base + extension).href, context);
    }
  }
  return nextResolve(specifier, context);
}
