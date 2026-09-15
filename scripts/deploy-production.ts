import { spawnSync } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const productionEnvironment = {
  ...process.env,
  CLOUDFLARE_ENV: "production",
};

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, {
    env: productionEnvironment,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(npmCommand, ["run", "build"]);
run(npmCommand, ["exec", "--", "wrangler", "deploy"]);
