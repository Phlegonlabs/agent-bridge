// Adjust the bridge, workspace, and task paths before using this script.
// world.run accepts fixed command literals; it does not expand shell variables.
phase("並行執行兩個唯讀 Agent");

const results = await Promise.all([
  world.run("node", [
    "C:/path/to/agent-bridge/bin/bridge.mjs",
    "run", "--agent", "bridge-explorer",
    "--cwd", "C:/path/to/agent-bridge",
    "--task-file", "C:/path/to/agent-bridge/examples/probe-task.txt",
    "--timeout-ms", "60000",
  ], { timeoutMs: 90000 }),
  world.run("node", [
    "C:/path/to/agent-bridge/bin/bridge.mjs",
    "run", "--agent", "bridge-reviewer",
    "--cwd", "C:/path/to/agent-bridge",
    "--task-file", "C:/path/to/agent-bridge/examples/probe-task.txt",
    "--timeout-ms", "60000",
  ], { timeoutMs: 90000 }),
]);

for (const result of results) {
  if (result.exitCode !== 0) throw new Error("Bridge failed: " + result.stdout);
}
const parsed = results.map(result => JSON.parse(result.stdout) as {
  ok: boolean; agent: string; actualModel: string; response: string;
});
for (const result of parsed) {
  if (result.ok !== true || typeof result.agent !== "string" ||
      typeof result.actualModel !== "string" || typeof result.response !== "string") {
    throw new Error("Unverified agent result");
  }
  report({ agent: result.agent, actualModel: result.actualModel, response: result.response });
}
return parsed;
