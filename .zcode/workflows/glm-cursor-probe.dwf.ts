/* zcode-workflow
description: 並行驗證 GLM-5.3-Flash、GLM-5.3 與 Cursor Composer 2.5
whenToUse: 在此專案驗證 ZCode 與 Cursor CLI 混合編排
*/
phase("並行驗證 GLM 與 Cursor");
const results = await Promise.all([
  world.run("node", [
    "bin/bridge.mjs", "run", "--agent", "bridge-explorer",
    "--cwd", ".", "--task-file", "examples/probe-task.txt",
    "--expected-model", "account:zai-individual-coding-plan/GLM-5.3-Flash",
    "--timeout-ms", "60000",
  ], { timeoutMs: 90000 }),
  world.run("node", [
    "bin/bridge.mjs", "run", "--agent", "bridge-reviewer",
    "--cwd", ".", "--task-file", "examples/probe-task.txt",
    "--expected-model", "account:zai-individual-coding-plan/GLM-5.3",
    "--timeout-ms", "120000",
  ], { timeoutMs: 150000 }),
  world.run("node", [
    "bin/bridge.mjs", "run", "--provider", "cursor", "--model", "composer-2.5",
    "--cwd", ".", "--task-file", "examples/probe-task.txt", "--trust-workspace",
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
      typeof result.actualModel !== "string" || typeof result.response !== "string" ||
      result.response.trim() !== "BRIDGE_PROBE_OK") throw new Error("Unverified probe result");
  report({ agent: result.agent, actualModel: result.actualModel, response: result.response });
}
return parsed;
