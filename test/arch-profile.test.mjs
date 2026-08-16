/**
 * arch-profile.test.mjs — arch-profile.mjs 的 CLI 契约测试（node:test，零依赖）。
 *
 * 说明：
 *   - 通过 spawnSync 直接调 CLI 并断言 JSON 输出，测的是 runbook 实际使用的调用契约。
 *   - 运行环境（开发机 / CI）spawn 子进程没有问题；「不 spawn」红线仅约束 DSH 沙箱内的运行时脚本。
 *
 * 运行：node --test test/arch-profile.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts", "arch-profile.mjs");
const fixtures = join(root, "test", "fixtures");

/** 跑 CLI，返回 { code, stdout, stderr, json } */
function run(repo, ...args) {
  const r = spawnSync(process.execPath, [script, repo, ...args], { encoding: "utf8" });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* 非 JSON 输出或报错时为 null */
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

const pythonApp = join(fixtures, "python-app");
const nodeApp = join(fixtures, "node-app");

test("probe-python：识别 python + repo_type", () => {
  const { code, json } = run(pythonApp, "--probe");
  assert.equal(code, 0);
  assert.equal(json.project.language, "python");
  assert.equal(json.project.repo_type, "monolith");
  assert.equal(json.project.name, "demo-api");
});

test("probe-node：识别 javascript", () => {
  const { code, json } = run(nodeApp, "--probe");
  assert.equal(code, 0);
  assert.equal(json.project.language, "javascript");
  assert.equal(json.project.name, "demo-web");
});

test("scan-python：src 下模块划分正确", () => {
  const { json } = run(pythonApp, "--scan");
  const names = json.modules.map((m) => m.name).sort();
  assert.deepEqual(names, ["api", "auth"]);
  const api = json.modules.find((m) => m.name === "api");
  assert.equal(api.path, "src/api");
  assert.ok(api.key_files.includes("src/api/router.py"));
});

test("deps-python：from auth.service import 生成 api->auth 内部依赖", () => {
  const { json } = run(pythonApp, "--deps");
  assert.ok(
    json.dependencies.internal.some((d) => d.source === "api" && d.target === "auth" && d.kind === "import"),
    "应有 api->auth 内部依赖"
  );
});

test("deps-external：fastapi 归入 external 且带版本", () => {
  const { json } = run(pythonApp, "--deps");
  const fastapi = json.dependencies.external.find((d) => d.name === "fastapi");
  assert.ok(fastapi, "fastapi 应在 external");
  assert.equal(fastapi.category, "web");
  assert.equal(fastapi.version, "0.115.0");
});

test("entry-web：识别 src/main.py + uvicorn 为 web 入口", () => {
  const { json } = run(pythonApp, "--entry");
  const web = json.entry_points.find((e) => e.path === "src/main.py");
  assert.ok(web, "src/main.py 应为入口点");
  assert.equal(web.type, "web");
});

test("entry-cli：识别 cli.py 为 cli 入口", () => {
  const dir = mkdtempSync(join(tmpdir(), "arch-doc-cli-"));
  try {
    writeFileSync(join(dir, "cli.py"), "import argparse\n\nparser = argparse.ArgumentParser()\n");
    const { json } = run(dir, "--entry");
    assert.ok(
      json.entry_points.some((e) => e.type === "cli" && e.path === "cli.py"),
      "cli.py 应识别为 cli 入口"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run-methods：从 package.json scripts 提取 dev/build/test", () => {
  const { json } = run(nodeApp, "--entry");
  const actions = new Set(json.run_methods.map((m) => m.action));
  for (const a of ["dev", "build", "test", "install"]) {
    assert.ok(actions.has(a), "缺 action: " + a);
  }
});

test("output-json：--all 输出结构字段齐全", () => {
  const { code, json } = run(pythonApp, "--all");
  assert.equal(code, 0);
  for (const k of ["project", "modules", "dependencies", "entry_points", "run_methods", "key_flows", "directory_tree", "risks"]) {
    assert.ok(k in json, "缺字段: " + k);
  }
  assert.equal(json.project.language, "python");
  assert.ok(json.modules.length > 0);
  assert.ok(json.modules.every((m) => m.name && m.path && Array.isArray(m.key_files)));
  assert.ok(Array.isArray(json.dependencies.internal));
  assert.ok(Array.isArray(json.dependencies.external));
});

test("skip-excluded：node_modules 下文件不参与扫描", () => {
  const dir = mkdtempSync(join(tmpdir(), "arch-doc-excl-"));
  try {
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "src", "app.js"), "const x = 1;\n");
    writeFileSync(join(dir, "node_modules", "evil.js"), "const y = 1;\n");
    const { json } = run(dir, "--all");
    assert.ok(!json.directory_tree.includes("node_modules"), "directory_tree 不应包含 node_modules");
    const allPaths = json.modules.flatMap((m) => [m.path, ...m.key_files]);
    assert.ok(!allPaths.some((p) => p.startsWith("node_modules")), "模块路径/key_files 不应包含 node_modules");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("缺参数退出码 2；目录不存在退出码 2", () => {
  assert.equal(run().code, 2);
  assert.equal(run(join(tmpdir(), "arch-doc-no-such-dir"), "--probe").code, 2);
});
