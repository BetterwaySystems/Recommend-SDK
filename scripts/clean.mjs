import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function rm(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (_) {}
}

rm(path.join(root, "dist", "browser"));
rm(path.join(root, "dist", "node"));

