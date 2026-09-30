/* zcode-workflow
description: 在允許的 Cursor worker 中自動分派任務，預設最多並行 14 個，fallback 預設關閉
whenToUse: 多模型 auto route。主模型可先分解獨立任務，以 jobs 指定允許的 worker；只有 task 時由原生規劃 Agent 自動分派
args:
  task:
    type: string
    description: 本階段的總任務；主模型負責彙整結果和後續階段
    required: true
  preset:
    type: string
    description: 已保存的執行組合名稱；留空使用設定檔的預設組合
  jobs:
    type: json
    description: 可選。主模型的分派陣列，每項有 id、worker、task；不提供時自動規劃。只放本階段互相獨立的任務
  parallelLimit:
    type: number
    description: 本次最多同時執行幾個 worker（1 到 14）；留空沿用組合設定
  fallback:
    type: string
    description: off 關閉備援，configured 依已保存的候選順序執行；留空沿用組合設定
*/
if (typeof args.task !== "string" || !args.task.trim()) throw new Error("task is required");
const commandArgs = ["bin/bridge.mjs", "workflow", "--cwd", ".", "--trust-workspace"];
for (const option of ["preset", "fallback"]) {
  const value = args[option];
  if (value !== undefined) {
    if (typeof value !== "string") throw new Error("Invalid " + option);
    if (value.trim()) commandArgs.push("--" + option + "=" + value.trim());
  }
}
if (args.parallelLimit !== undefined) {
  if (typeof args.parallelLimit !== "number") throw new Error("Invalid parallelLimit");
  commandArgs.push("--parallel-limit=" + String(args.parallelLimit));
}
phase("確認允許的模型與任務分派");
const catalogResult = await world.run("node", ["bin/bridge.mjs", "presets"], { timeoutMs: 10000 });
if (catalogResult.exitCode !== 0) throw new Error("Cannot load presets: " + catalogResult.stdout);
const catalog = JSON.parse(catalogResult.stdout) as {
  defaultPreset: string;
  presets: Record<string, {
    parallelLimit: number;
    workers: Record<string, { description: string; route: string; fallbacks: string[] }>;
    routes: Record<string, { provider: string; agent?: string; expectedModel?: string; model?: string }>;
  }>;
};
const presetName = typeof args.preset === "string" && args.preset.trim() ? args.preset.trim() : catalog.defaultPreset;
const selected = catalog.presets[presetName];
if (!selected) throw new Error("Unknown preset");
interface RoutedJob { id: string; worker: string; task: string; }
interface RoutingPlan { jobs: RoutedJob[]; }
let jobs: RoutedJob[];
if (args.jobs !== undefined) {
  if (!Array.isArray(args.jobs)) throw new Error("jobs must be an array");
  jobs = args.jobs as RoutedJob[];
} else {
  const planner = agent("bridge-router", {
    system: "You plan independent tasks and select workers from an explicit allowlist. Plan only; do not use tools or execute work. Do not change the allowlist, models, permissions or fallback policy."
  });
  const plan = await planner.ask<RoutingPlan>(
    "Split the current stage into only useful independent read-only tasks. Freely choose the best worker for each task from this allowlist. " +
    "You may choose the same worker for multiple different tasks. Do not create tasks merely to fill concurrency slots. " +
    "Jobs execute concurrently; do not include dependencies between jobs. Later stages belong to the outer orchestrator. " +
    "Return 1..32 jobs, each with a unique lowercase id (letters/digits/hyphens, starts with a letter), worker, and self-contained task. " +
    "Keep the entire jobs JSON under 12000 characters. These workers support analysis and review, not file changes. " +
    "Allowed worker definitions and routes: " + JSON.stringify(selected) + "\nUser task: " + args.task
  );
  jobs = plan.jobs;
}
if (!Array.isArray(jobs) || jobs.length < 1 || jobs.length > 32) throw new Error("Invalid job count");
for (const job of jobs) {
  if (!job || typeof job.id !== "string" || typeof job.worker !== "string" ||
      typeof job.task !== "string" || !Object.keys(selected.workers).includes(job.worker)) throw new Error("Worker is outside the allowlist");
  report({ id: job.id, worker: job.worker, route: selected.workers[job.worker].route });
}
const jobsJson = JSON.stringify(jobs);
if (jobsJson.length > 12000) throw new Error("Plan exceeds inline command size; use the bridge CLI with --jobs-file");
commandArgs.push("--jobs-json=" + jobsJson);
phase("依保存的模型組合執行任務");
const result = await world.run("node", commandArgs, { timeoutMs: 600000 });
if (result.exitCode !== 0) throw new Error("Bridge failed: " + result.stdout);
const parsed = JSON.parse(result.stdout) as {
  ok: boolean; preset: string; parallelLimit: number; peakParallel: number; fallbackEnabled: boolean;
  logs: string;
  jobs: { id: string; worker: string; ok: boolean; actualModel: string; response: string; responseTruncated: boolean; fallbackUsed: boolean }[];
};
if (parsed.ok !== true || typeof parsed.preset !== "string" ||
    typeof parsed.parallelLimit !== "number" || typeof parsed.peakParallel !== "number" ||
    typeof parsed.fallbackEnabled !== "boolean" || !Array.isArray(parsed.jobs)) throw new Error("Unverified workflow result");
report({ preset: parsed.preset, parallelLimit: parsed.parallelLimit, peakParallel: parsed.peakParallel, fallbackEnabled: parsed.fallbackEnabled, logs: parsed.logs });
for (const job of parsed.jobs) {
  if (job.ok !== true || typeof job.id !== "string" || typeof job.worker !== "string" ||
      typeof job.actualModel !== "string" || typeof job.response !== "string" ||
      typeof job.responseTruncated !== "boolean" || typeof job.fallbackUsed !== "boolean") throw new Error("Unverified worker result");
  report({ id: job.id, worker: job.worker, actualModel: job.actualModel, response: job.response, responseTruncated: job.responseTruncated, fallbackUsed: job.fallbackUsed });
}
return parsed;
