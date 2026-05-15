import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
/** 小程序已改走后端聚合接口，此处仅产出可选 Node/工具链产物，避免与 Java 双源混淆 */
const outDir = path.join(root, "build");
const outfile = path.join(outDir, "telemetryViewModel.cjs");

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "frontend", "src", "telemetry-view", "index.ts")],
  bundle: true,
  platform: "neutral",
  format: "cjs",
  target: "es2015",
  outfile,
  logLevel: "info",
});

console.log("Wrote", outfile);
