import { execFileSync } from "node:child_process";

function getArg(name: string) {
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : undefined;
}

const port = getArg("--port");

if (!port) {
  console.error("[MIND][PortGuard] Missing --port=<number>.");
  process.exit(1);
}

function run(command: string, args: string[]) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

let pids: string[] = [];

try {
  const output = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  pids = output ? output.split("\n").map((value) => value.trim()).filter(Boolean) : [];
} catch {
  pids = [];
}

if (pids.length === 0) {
  process.exit(0);
}

for (const pid of pids) {
  try {
    const command = run("ps", ["-p", pid, "-o", "command="]);
    if (!command.includes("next")) {
      console.error(`[MIND][PortGuard] Port ${port} is busy with a non-Next process: ${command}`);
      process.exit(1);
    }

    process.kill(Number(pid), "SIGTERM");
    console.log(`[MIND][PortGuard] Stopped existing dev server on port ${port} (pid ${pid}).`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[MIND][PortGuard] Failed to stop pid ${pid} on port ${port}: ${detail}`);
    process.exit(1);
  }
}
