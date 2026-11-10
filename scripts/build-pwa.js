import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";

export async function buildPWA(directory) {
  const root = resolve(directory);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile())
    .map((entry) => relative(root, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .filter((name) => !["sw.js", "_headers", "_redirects", "ATTRIBUTION.md"].includes(name) && !name.endsWith(".map"))
    .sort();
  const hash = createHash("sha256");
  const template = await readFile(new URL("./service-worker.js", import.meta.url), "utf8");
  hash.update(template);
  for (const name of files) {
    hash.update(name);
    hash.update(await readFile(resolve(root, name)));
  }
  const version = hash.digest("hex").slice(0, 16);
  const code = template.replace("__PRECACHE__", JSON.stringify(files.map((name) => `/${name}`)))
    .replace("__VERSION__", JSON.stringify(version));
  await writeFile(resolve(root, "sw.js"), code);
  return { version, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildPWA(process.argv[2] || "dist");
  console.log(`PWA ${result.version} : ${result.files.length} ressources disponibles hors connexion.`);
}
