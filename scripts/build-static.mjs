import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceHtmlPath = path.join(projectRoot, "index.html");
const outputDirectory = path.join(projectRoot, "public");
const sourceHtml = await readFile(sourceHtmlPath, "utf8");

const referencedAssets = new Set();
const assetPatterns = [
  /\b(?:href|poster|src)=["'](assets\/[^"'?#]+)["']/gu,
  /url\(\s*["']?(assets\/[^"')?#]+)["']?\s*\)/gu,
];

for (const pattern of assetPatterns) {
  for (const match of sourceHtml.matchAll(pattern)) referencedAssets.add(match[1]);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await copyFile(sourceHtmlPath, path.join(outputDirectory, "index.html"));

for (const relativeAssetPath of [...referencedAssets].sort()) {
  const normalizedPath = path.posix.normalize(relativeAssetPath);
  if (!normalizedPath.startsWith("assets/") || normalizedPath.includes("..")) {
    throw new Error(`Unsafe asset path in index.html: ${relativeAssetPath}`);
  }

  const sourcePath = path.join(projectRoot, ...normalizedPath.split("/"));
  const sourceStats = await stat(sourcePath).catch(() => null);
  if (!sourceStats?.isFile()) {
    throw new Error(`Referenced frontend asset does not exist: ${normalizedPath}`);
  }

  const destinationPath = path.join(outputDirectory, ...normalizedPath.split("/"));
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

console.log(`Prepared public/ with index.html and ${referencedAssets.size} referenced assets.`);
