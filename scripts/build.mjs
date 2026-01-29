import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copy(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

async function build() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const sdkVersion = String(pkg && pkg.version ? pkg.version : "0.0.0");
  const define = { __SDK_VERSION__: JSON.stringify(sdkVersion) };

  const distBrowser = path.join(root, "dist", "browser");
  const distNode = path.join(root, "dist", "node");

  ensureDir(distBrowser);
  ensureDir(distNode);

  try {
    // ---- Browser module outputs (for bundlers) ----
    const browserModuleEntry = path.join(root, "src", "browser", "recommend-sdk.module.js");
    await esbuild.build({
      entryPoints: [browserModuleEntry],
      outfile: path.join(distBrowser, "recommend-sdk.mjs"),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: ["es2018"],
      sourcemap: false,
      legalComments: "none",
      define,
    });

    await esbuild.build({
      entryPoints: [browserModuleEntry],
      outfile: path.join(distBrowser, "recommend-sdk.cjs"),
      bundle: true,
      format: "cjs",
      platform: "browser",
      target: ["es2018"],
      sourcemap: false,
      legalComments: "none",
      define,
    });

    // ---- Browser CDN/IIFE outputs (global window.RecommendSDK) ----
    const browserGlobalEntry = path.join(root, "src", "browser", "recommend-sdk.global.js");

    await esbuild.build({
      entryPoints: [browserGlobalEntry],
      outfile: path.join(distBrowser, "recommend-sdk.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: ["es2018"],
      sourcemap: false,
      legalComments: "none",
      define,
    });

    await esbuild.build({
      entryPoints: [browserGlobalEntry],
      outfile: path.join(distBrowser, "recommend-sdk.min.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: ["es2018"],
      sourcemap: false,
      minify: true,
      legalComments: "none",
      define,
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    // pnpm 보안 설정에서 esbuild postinstall이 막히면 바이너리가 준비되지 않아 실패할 수 있음
    console.error("[build] esbuild failed:", msg);
    console.error("");
    console.error("[build] If you use pnpm and see warnings like 'Ignored build scripts: esbuild', run:");
    console.error("  pnpm approve-builds");
    console.error("  pnpm rebuild esbuild");
    console.error("then re-run:");
    console.error("  pnpm build");
    process.exitCode = 1;
    return;
  }

  // Keep legacy root artifacts for CDN users
  copy(path.join(distBrowser, "recommend-sdk.js"), path.join(root, "recommend-sdk.js"));
  copy(path.join(distBrowser, "recommend-sdk.min.js"), path.join(root, "recommend-sdk.min.js"));

  // ---- Node output (CJS) ----
  const nodeEntry = path.join(root, "src", "node", "recommend-sdk-node.cjs");
  await esbuild.build({
    entryPoints: [nodeEntry],
    outfile: path.join(distNode, "recommend-sdk-node.js"),
    bundle: false,
    format: "cjs",
    platform: "node",
    target: ["node18"],
    sourcemap: false,
    legalComments: "none",
    define,
  });

  console.log("[build] outputs:");
  console.log(" - dist/browser/recommend-sdk.mjs");
  console.log(" - dist/browser/recommend-sdk.cjs");
  console.log(" - dist/browser/recommend-sdk.js");
  console.log(" - dist/browser/recommend-sdk.min.js");
  console.log(" - dist/node/recommend-sdk-node.js");
}

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

