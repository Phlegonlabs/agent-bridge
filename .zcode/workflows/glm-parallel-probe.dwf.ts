/* zcode-workflow
description: 同時驗證 code_explorer 的 GLM-5.3-Flash 和 reviewer 的 GLM-5.3
whenToUse: 在 zcode-workflow-bridge 專案確認 GLM 多模型橋接是否可用
*/
phase("並行驗證兩個 GLM Agent");

const results = await Promise.all([
  world.run("node", [
    "bin/bridge.mjs", "run", "--agent", "code_explorer",
    "--cwd", ".", "--task-file", "examples/probe-task.txt",
    "--expected-model", "account:zai-individual-coding-plan/GLM-5.3-Flash",
    "--timeout-ms", "60000",
  ], { timeoutMs: 90000 }),
  world.run("node", [
    "bin/bridge.mjs", "run", "--agent", "reviewer",
    "--cwd", ".", "--task-file", "examples/probe-task.txt",
    "--expected-model", "account:zai-individual-coding-plan/GLM-5.3",
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
      result.response.trim() !== "BRIDGE_PROBE_OK") {
    throw new Error("Agent probe did not return a verified result");
  }
  report({ agent: result.agent, actualModel: result.actualModel, response: result.response });
}
return parsed;
