import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildPWA } from "../scripts/build-pwa.js";

const origin = "https://particules.test";
const absolute = (url) => new URL(typeof url === "string" ? url : url.url, origin).href;
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "particules-pwa-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "assets"));
  for (const [name, content] of Object.entries({ "index.html": "app-v1", "assets/main.js": "module-v1", "manifest.webmanifest": "{}", "_headers": "private config" }))
    await writeFile(join(dir, name), content);
  const build = await buildPWA(dir);
  return { dir, build };
}

async function worker(dir, { offline = false, fail = "", stores = new Map() } = {}) {
  const handlers = new Map();
  const fetches = [];
  const fetch = async (request) => {
    const url = absolute(request);
    fetches.push(url);
    if (offline || url.endsWith(fail || "__never__")) throw new TypeError("network unavailable");
    try { return new Response(await readFile(join(dir, new URL(url).pathname))); }
    catch { return new Response("not found", { status: 404 }); }
  };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        async match(request) { return data.get(absolute(request))?.clone(); },
        async addAll(requests) {
          const responses = await Promise.all(requests.map(async (request) => {
            const response = await fetch(request);
            if (!response.ok) throw new Error("precache failure");
            return [absolute(request), response];
          }));
          for (const [url, response] of responses) data.set(url, response);
        },
      };
    },
    async match(request) {
      for (const data of stores.values()) {
        const response = data.get(absolute(request));
        if (response) return response.clone();
      }
    },
  };
  const self = { location: { origin }, clients: { async claim() {} }, async skipWaiting() {},
    addEventListener(name, handler) { handlers.set(name, handler); } };
  class WorkerRequest extends Request {
    constructor(url, init) { super(absolute(url), init); }
  }
  vm.runInNewContext(await readFile(join(dir, "sw.js"), "utf8"), { self, caches, fetch, Request: WorkerRequest, URL, Set });
  return {
    stores, fetches,
    async emit(type, data = {}) {
      let task;
      handlers.get(type)({ ...data, waitUntil(promise) { task = promise; }, respondWith(promise) { task = promise; } });
      return task;
    },
  };
}

test("the production shell and its modules reopen offline, including launch query strings", async (t) => {
  const { dir } = await fixture(t);
  const online = await worker(dir);
  await online.emit("install");
  const offline = await worker(dir, { stores: online.stores, offline: true });
  await offline.emit("activate");
  const page = await offline.emit("fetch", { request: { url: `${origin}/?source=installed`, method: "GET", mode: "navigate", headers: new Headers() } });
  assert.equal(await page.text(), "app-v1");
  const module = await offline.emit("fetch", { request: new Request(`${origin}/assets/main.js`) });
  assert.equal(await module.text(), "module-v1");
  assert.equal(offline.fetches.length, 0);
});

test("a failed upgrade cannot delete or replace the installed shell", async (t) => {
  const { dir, build } = await fixture(t);
  const old = await worker(dir);
  await old.emit("install");
  await writeFile(join(dir, "assets/main.js"), "module-v2");
  const next = await buildPWA(dir);
  assert.notEqual(next.version, build.version);
  const update = await worker(dir, { stores: old.stores, fail: "/assets/main.js" });
  await assert.rejects(update.emit("install"), /network unavailable/);
  assert.deepEqual([...update.stores.keys()], [`particules-shell-${build.version}`]);
  assert.equal(await update.stores.get(`particules-shell-${build.version}`).get(`${origin}/assets/main.js`).clone().text(), "module-v1");
});

test("the worker ignores local photos, AI downloads, non-GETs and missing assets", async (t) => {
  const { dir } = await fixture(t);
  const sw = await worker(dir);
  await sw.emit("install");
  for (const request of [new Request("https://huggingface.co/model.onnx"),
    new Request(`${origin}/photo`, { method: "POST" }), new Request("blob:https://particules.test/local-photo")])
    assert.equal(await sw.emit("fetch", { request }), undefined);
  const missing = await sw.emit("fetch", { request: new Request(`${origin}/assets/missing.js`) });
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "not found");
});

test("build versions are deterministic, omit server settings and change with public resources", async (t) => {
  const { dir, build } = await fixture(t);
  assert.equal((await buildPWA(dir)).version, build.version);
  assert.ok(!build.files.includes("_headers"));
  assert.ok(!build.files.includes("sw.js"));
  await writeFile(join(dir, "manifest.webmanifest"), '{"name":"Particules"}');
  assert.notEqual((await buildPWA(dir)).version, build.version);
});

test("a successful upgrade serves a coherent new shell and retains previous tab resources", async (t) => {
  const { dir, build } = await fixture(t);
  const old = await worker(dir);
  await old.emit("install");
  old.stores.set("another-application", new Map());
  old.stores.set("particules-shell-obsolete", new Map());
  // Insert the real previous version last, as CacheStorage does on creation.
  const previous = old.stores.get(`particules-shell-${build.version}`);
  old.stores.delete(`particules-shell-${build.version}`);
  old.stores.set(`particules-shell-${build.version}`, previous);
  await writeFile(join(dir, "index.html"), "app-v2");
  await writeFile(join(dir, "assets/main-v2.js"), "module-v2");
  await rm(join(dir, "assets/main.js"));
  const next = await buildPWA(dir);
  const update = await worker(dir, { stores: old.stores });
  await update.emit("install");
  await update.emit("activate");
  assert.ok(update.stores.has("another-application"));
  assert.ok(!update.stores.has("particules-shell-obsolete"));
  assert.ok(update.stores.has(`particules-shell-${build.version}`));
  assert.ok(update.stores.has(`particules-shell-${next.version}`));
  const offline = await worker(dir, { stores: update.stores, offline: true });
  const page = await offline.emit("fetch", { request: { url: `${origin}/`, method: "GET", mode: "navigate", headers: new Headers() } });
  assert.equal(await page.text(), "app-v2");
  const previousModule = await offline.emit("fetch", { request: new Request(`${origin}/assets/main.js`) });
  assert.equal(await previousModule.text(), "module-v1");
});
