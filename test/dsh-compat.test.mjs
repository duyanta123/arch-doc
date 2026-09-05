import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const DSH_VERSION = "0.1.2-rc.1";
const MIN_NODE = [22, 19, 0];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const patchText = await readFile(join(repoRoot, "cordis.patch.yml"), "utf8");
const pluginId = patchText.match(/^\s*- id:\s*([^\s#]+)/m)?.[1];
const failurePattern = /ERR_MODULE_NOT_FOUND|Cannot find package|patch file|manifest|syntax error|skill.*fail|skill provider unavailable|failed to import|failed to apply loader|Cannot find the native Koffi/i;
let cleanupRoot;

function versionAtLeast(actual, required) {
  const parts = actual.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return parts[0] > required[0]
    || (parts[0] === required[0] && parts[1] > required[1])
    || (parts[0] === required[0] && parts[1] === required[1] && parts[2] >= required[2]);
}

function run(bin, args, options = {}) {
  return spawnSync(bin, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeout ?? 240_000,
    windowsHide: true,
    shell: options.shell ?? (process.platform === "win32" && /\.(cmd|bat)$/i.test(bin)),
    maxBuffer: 8 * 1024 * 1024,
  });
}

function outputOf(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function assertOk(result, label) {
  const output = outputOf(result);
  if (result.error) throw new Error(`${label} failed: ${result.error.message}\n${output}`);
  if (result.status !== 0) throw new Error(`${label} exited ${result.status}\n${output}`);
  if (failurePattern.test(output)) throw new Error(`${label} reported a loader error\n${output}`);
  return output;
}

function terminateChild(child) {
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function waitForExit(child, timeoutMs) {
  const output = [];
  const errors = [];
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => errors.push(String(chunk)));
  return new Promise((resolveExit, reject) => {
    let settled = false;
    let terminatedAfterTimeout = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExit({ ...result, output: output.join("") + errors.join("") });
    };
    timer = setTimeout(() => {
      if (settled) return;
      terminatedAfterTimeout = true;
      // A long-running process is the expected successful startup result. Kill it
      // and wait for close so Windows does not leave files locked during cleanup.
      terminateChild(child);
      const closeTimer = setTimeout(() => finish({ timedOut: true, code: 0 }), 5_000);
      child.once("close", () => {
        clearTimeout(closeTimer);
        finish({ timedOut: true, code: 0 });
      });
    }, timeoutMs);
    child.once("error", (error) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        reject(error);
      }
    });
    child.once("close", (code, signal) => finish({ timedOut: terminatedAfterTimeout, code, signal }));
  });
}

async function runCompat() {
  if (!versionAtLeast(process.versions.node, MIN_NODE)) {
    throw new Error(`DSH ${DSH_VERSION} compat requires Node >=22.19.0; found ${process.versions.node}`);
  }
  if (!pluginId) throw new Error("cordis.patch.yml has no plugin id");
  const skillDirs = (await readdir(join(repoRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  if (skillDirs.length === 0) throw new Error("no skill directories found");
  if (!existsSync(join(repoRoot, "plugin", "index.js"))) throw new Error("plugin/index.js is missing");
  for (const skillDir of skillDirs) {
    const skillText = await readFile(join(repoRoot, "skills", skillDir.name, "SKILL.md"), "utf8");
    const frontmatter = skillText.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatter || !/^name:\s*\S+/m.test(frontmatter[1]) || !/^description:\s*\S+/m.test(frontmatter[1])) {
      throw new Error(`invalid skill frontmatter: ${skillDir.name}`);
    }
  }

  const workRoot = await mkdtemp(join(tmpdir(), "dsh-compat-"));
  cleanupRoot = workRoot;
  const cliRoot = join(workRoot, "cli");
  const dshHome = join(workRoot, "dsh-home");
  const dshAgentsHome = join(workRoot, "dsh-agents-home");
  const packRoot = join(workRoot, "pack");
  await mkdir(cliRoot, { recursive: true });
  await mkdir(dshHome, { recursive: true });
  await mkdir(dshAgentsHome, { recursive: true });
  await mkdir(packRoot, { recursive: true });

  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath || !existsSync(npmExecPath)) {
    throw new Error("npm_execpath is unavailable; run this check through npm run test:compat");
  }
  const runNpm = (args, options = {}) => run(process.execPath, [npmExecPath, ...args], options);
  const install = runNpm([
    "install", "--prefix", cliRoot, "--no-save", "--no-package-lock",
    `@deepseek-ai/dsh@${DSH_VERSION}`,
  ], {
    env: { ...process.env, DSH_HOME: dshHome, DSH_AGENTS_HOME: dshAgentsHome },
    timeout: 600_000,
  });
  assertOk(install, `install @deepseek-ai/dsh@${DSH_VERSION}`);

  const dshBin = process.platform === "win32"
    ? join(cliRoot, "node_modules", ".bin", "dsh.cmd")
    : join(cliRoot, "node_modules", ".bin", "dsh");
  if (!existsSync(dshBin)) throw new Error(`DSH CLI entry not found: ${dshBin}`);
  const env = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_AGENTS_HOME: dshAgentsHome,
    DSH_TELEMETRY_DISABLED: "1",
  };

  // First exercise the required repository-path install contract.
  assertOk(run(dshBin, ["plugin", "--profile", "compat", "add", repoRoot], { env }), "dsh plugin add local bundle");
  const localDump = assertOk(run(dshBin, ["--profile", "compat", "--dump-config"], { env }), "dsh --dump-config after local add");
  if (!localDump.includes(packageJson.name) || !localDump.includes(pluginId)) {
    throw new Error(`config dump does not contain local bundle ${packageJson.name}/${pluginId}\n${localDump}`);
  }

  // The local add above validates the repository bundle. For startup, use the
  // packed artifact so optional host peers resolve exactly as they do after publish.
  const packed = runNpm(["pack", "--json", "--pack-destination", packRoot], { env, timeout: 120_000 });
  const packedOutput = assertOk(packed, "npm pack bundle");
  let packMetadata;
  try {
    packMetadata = JSON.parse(packed.stdout);
  } catch (error) {
    throw new Error(`npm pack did not return JSON: ${error.message}\n${packedOutput}`);
  }
  const filename = packMetadata?.[0]?.filename;
  if (!filename) throw new Error(`npm pack returned no artifact filename\n${packedOutput}`);
  const tgz = join(packRoot, basename(filename));
  if (!existsSync(tgz)) throw new Error(`npm pack artifact missing: ${tgz}`);

  assertOk(run(dshBin, ["plugin", "--profile", "compat", "remove", packageJson.name], { env }), "remove local bundle");
  assertOk(run(dshBin, [
    "plugin", "--profile", "compat", "add",
    `@deepseek-ai/dsh-skill-filesystem@${DSH_VERSION}`,
  ], { env }), "install host skill provider");
  assertOk(run(dshBin, ["plugin", "--profile", "compat", "add", tgz], { env }), "add packed bundle");

  const dump = assertOk(run(dshBin, ["--profile", "compat", "--dump-config"], { env }), "dsh --dump-config");
  if (!dump.includes(packageJson.name) || !dump.includes(pluginId)) {
    throw new Error(`config dump does not contain bundle ${packageJson.name}/${pluginId}\n${dump}`);
  }

  const child = spawn(dshBin, ["--profile", "compat"], {
    cwd: repoRoot,
    env,
    windowsHide: true,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exit = await waitForExit(child, 12_000);
  if (failurePattern.test(exit.output)) {
    throw new Error(`dsh startup reported a loader error\n${exit.output}`);
  }
  if (!exit.timedOut && exit.code !== 0) {
    throw new Error(`dsh exited before timeout with code ${exit.code}\n${exit.output}`);
  }
}

try {
  await runCompat();
  console.log(`DSH ${DSH_VERSION} compat passed for ${packageJson.name}`);
} finally {
  if (cleanupRoot) await rm(cleanupRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
