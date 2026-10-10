// `npm test` loads this first (node --import ./tests/register.mjs): it teaches Node's ESM loader the two import styles the
// app's TypeScript uses, extensionless relative paths and the "@/" alias, so lib/*.ts can be imported without a build.
import { register } from "node:module";

register("./resolver.mjs", import.meta.url);
