const { execSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

// Load .env if present so we use the same PORT as the server.
try {
  require("dotenv").config({ path: path.join(projectRoot, ".env") });
} catch {
  // dotenv is in dependencies; if it fails, fall back to defaults.
}

const port = Number(process.env.PORT || 5050);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`[free-port] Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

function getPidsOnPort(p) {
  try {
    const output = execSync(`lsof -nP -iTCP:${p} -sTCP:LISTEN -t`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (!output) return [];
    return output.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

const pids = getPidsOnPort(port);

if (pids.length === 0) {
  console.log(`[free-port] Port ${port} is free`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    execSync(`kill ${pid}`, { stdio: "ignore" });
    console.log(`[free-port] Stopped PID ${pid} on port ${port}`);
  } catch (err) {
    console.error(`[free-port] Failed to stop PID ${pid} on port ${port}`);
    process.exit(1);
  }
}
