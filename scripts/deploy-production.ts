import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const npmCommand = process.platform === "win32" ? process.execPath : "npm";
const npmArgsPrefix =
  process.platform === "win32"
    ? [
        path.join(
          path.dirname(process.execPath),
          "node_modules",
          "npm",
          "bin",
          "npm-cli.js",
        ),
      ]
    : [];
const productionEnvironment = {
  ...process.env,
  CLOUDFLARE_ENV: "production",
};

function run(args: readonly string[]): void {
  const result = spawnSync(npmCommand, [...npmArgsPrefix, ...args], {
    env: productionEnvironment,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to run npm: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["run", "build"]);
run(["exec", "--", "wrangler", "deploy"]);
