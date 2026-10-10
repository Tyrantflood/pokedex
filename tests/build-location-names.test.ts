import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/build-location-names.mjs", import.meta.url));

/** A tiny fake PokéAPI: two locations, three areas (one with no English name), and a count of the requests it got. */
async function fakeApi(options: { failDetails?: boolean } = {}) {
  let requests = 0;
  const named = (name: string) => ({ names: [{ name, language: { name: "en" } }, { name: "x", language: { name: "fr" } }] });
  let base = "";
  const server: Server = createServer((req, res) => {
    requests++;
    const url = new URL(req.url ?? "/", base);
    const send = (body: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const list = (kind: string, slugs: string[]) => send({ results: slugs.map((name) => ({ name, url: `${base}/${kind}/${name}` })) });
    if (url.pathname === "/location-area") return list("location-area", ["zeta-area", "alpha-area", "bare-area"]);
    if (url.pathname === "/location") return list("location", ["zeta", "alpha"]);
    if (options.failDetails) return send({}, 500);
    if (url.pathname === "/location-area/zeta-area") return send({ name: "zeta-area", ...named("Zeta"), location: { name: "zeta" } });
    if (url.pathname === "/location-area/alpha-area") return send({ name: "alpha-area", ...named("Road 1 (cave)"), location: { name: "alpha" } });
    if (url.pathname === "/location-area/bare-area") return send({ name: "bare-area", names: [], location: { name: "alpha" } });
    if (url.pathname === "/location/zeta") return send({ name: "zeta", ...named("Zeta") });
    if (url.pathname === "/location/alpha") return send({ name: "alpha", ...named("Route 1") });
    send({}, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    requests: () => requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const DEAD_API = "http://127.0.0.1:1"; // nothing listens there

function run(env: Record<string, string>, args: string[] = []) {
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, LOCATION_NAMES_MIN_AREAS: "2", LOCATION_NAMES_RETRY_MS: "1", ...env } });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const sandbox = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "location-names-"));
  return { file: path.join(dir, "table.json"), done: () => rmSync(dir, { recursive: true, force: true }) };
};
// A complete-looking table (two areas, which is the minimum these tests set), generated `generatedAt`.
const tableOf = (generatedAt: string) =>
  JSON.stringify({ version: 1, generatedAt, areas: { a: ["A", "x"], b: ["B", "x"] }, locations: { x: "X" } });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

test("builds the table from PokéAPI: English names only, sorted, null where there is none", async () => {
  const api = await fakeApi();
  const box = sandbox();
  try {
    const { code, out } = await run({ POKEAPI_BASE_URL: api.base, LOCATION_NAMES_OUT: box.file });
    assert.equal(code, 0, out);
    const table = JSON.parse(readFileSync(box.file, "utf8"));
    assert.equal(table.version, 1);
    assert.ok(Number.isFinite(Date.parse(table.generatedAt)));
    assert.deepEqual(table.areas, { "alpha-area": ["Road 1 (cave)", "alpha"], "bare-area": [null, "alpha"], "zeta-area": ["Zeta", "zeta"] });
    assert.deepEqual(table.locations, { alpha: "Route 1", zeta: "Zeta" });
    assert.deepEqual(Object.keys(table.areas), ["alpha-area", "bare-area", "zeta-area"], "keys are sorted, so a refresh makes small diffs");
  } finally {
    await api.close();
    box.done();
  }
});

test("a recent table is not refreshed: no request is made at all", async () => {
  const api = await fakeApi();
  const box = sandbox();
  try {
    writeFileSync(box.file, tableOf(daysAgo(3)));
    const before = readFileSync(box.file, "utf8");
    const { code, out } = await run({ POKEAPI_BASE_URL: api.base, LOCATION_NAMES_OUT: box.file });
    assert.equal(code, 0, out);
    assert.match(out, /not refreshing/);
    assert.equal(api.requests(), 0);
    assert.equal(readFileSync(box.file, "utf8"), before);
  } finally {
    await api.close();
    box.done();
  }
});

test("a stale table is refreshed, and --force refreshes a recent one", async () => {
  const api = await fakeApi();
  const box = sandbox();
  try {
    writeFileSync(box.file, tableOf(daysAgo(90)));
    assert.equal((await run({ POKEAPI_BASE_URL: api.base, LOCATION_NAMES_OUT: box.file })).code, 0);
    assert.ok("zeta-area" in JSON.parse(readFileSync(box.file, "utf8")).areas, "stale: refreshed");

    writeFileSync(box.file, tableOf(daysAgo(1)));
    await run({ POKEAPI_BASE_URL: api.base, LOCATION_NAMES_OUT: box.file }, ["--force"]);
    assert.ok("zeta-area" in JSON.parse(readFileSync(box.file, "utf8")).areas, "--force: refreshed");
  } finally {
    await api.close();
    box.done();
  }
});

test("when PokéAPI can't be reached the build still succeeds: it keeps the old table, or writes an empty one", async () => {
  const box = sandbox();
  try {
    const old = tableOf(daysAgo(90));
    writeFileSync(box.file, old);
    let result = await run({ POKEAPI_BASE_URL: DEAD_API, LOCATION_NAMES_OUT: box.file });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /WARNING/);
    assert.equal(readFileSync(box.file, "utf8"), old, "the old table is untouched");

    rmSync(box.file);
    result = await run({ POKEAPI_BASE_URL: DEAD_API, LOCATION_NAMES_OUT: box.file });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /empty one/);
    const empty = JSON.parse(readFileSync(box.file, "utf8"));
    assert.deepEqual([empty.areas, empty.locations], [{}, {}]);
  } finally {
    box.done();
  }
});

test("a half-failed fetch never replaces a good table", async () => {
  const api = await fakeApi({ failDetails: true });
  const box = sandbox();
  try {
    const old = tableOf(daysAgo(90));
    writeFileSync(box.file, old);
    const { code, out } = await run({ POKEAPI_BASE_URL: api.base, LOCATION_NAMES_OUT: box.file });
    assert.equal(code, 0, out);
    assert.match(out, /incomplete/);
    assert.equal(readFileSync(box.file, "utf8"), old);
  } finally {
    await api.close();
    box.done();
  }
});
