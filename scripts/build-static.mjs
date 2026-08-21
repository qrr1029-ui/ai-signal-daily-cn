import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const startedAt = Date.now();
let combinedOutput = "";

const child = spawn(
  process.execPath,
  [join("node_modules", "vinext", "dist", "cli.js"), "build"],
  { env: process.env, stdio: ["inherit", "pipe", "pipe"] },
);

for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    combinedOutput += text;
    (stream === child.stdout ? process.stdout : process.stderr).write(chunk);
  });
}

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

if (exitCode === 0) process.exit(0);

// vinext 1.0.0-beta.2 can finish a valid Windows export and then trip a
// libuv shutdown assertion. Never mask ordinary build failures: accept this
// one platform-specific case only when the success marker and freshly written
// route artifacts are both present.
if (process.platform === "win32" && combinedOutput.includes("Build complete.")) {
  const required = ["index.html", "wechat.html"];
  const fresh = await Promise.all(required.map(async (name) => {
    try {
      const file = await stat(join("dist", "client", name));
      return file.isFile() && file.size > 0 && file.mtimeMs >= startedAt - 2_000;
    } catch {
      return false;
    }
  }));
  if (fresh.every(Boolean)) {
    console.warn("vinext emitted a Windows shutdown assertion after a complete static export; verified fresh artifacts and continuing.");
    process.exit(0);
  }
}

process.exit(exitCode);
