import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyInteractiveProductionBuild } from "../lib/production-build-config.mjs";

const expectedOrigin = process.env.OPENMATCH_EXPECTED_WEB_API_ORIGIN?.trim();
if (expectedOrigin) {
  await verifyInteractiveProductionBuild(
    fileURLToPath(new URL("../.next/static/chunks/app", import.meta.url)),
    expectedOrigin,
  );
}

const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/next/dist/bin/next", import.meta.url),
    ),
    "start",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  throw error;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
