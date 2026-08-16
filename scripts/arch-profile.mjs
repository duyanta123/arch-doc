#!/usr/bin/env node
/**
 * arch-profile.mjs — 零依赖代码库架构探查脚本（纯 Node 内建，不 spawn 子进程）。
 *
 * 用途：对一个本地代码库做确定性扫描，产出「硬事实」JSON：
 *   project（语言/仓库类型/技术栈）、modules（模块划分）、dependencies（内部/外部依赖）、
 *   entry_points（入口点）、run_methods（安装/构建/测试/运行/部署命令）、directory_tree。
 *   LLM 只在此基础上补充语义字段（模块职责、项目描述、关键流程、风险等）。
 *
 * 用法：
 *   node arch-profile.mjs <repo_path> --probe
 *   node arch-profile.mjs <repo_path> --scan [--max-depth 3]
 *   node arch-profile.mjs <repo_path> --deps
 *   node arch-profile.mjs <repo_path> --entry
 *   node arch-profile.mjs <repo_path> --all
 *
 * 公共参数：
 *   --max-depth <N>        目录扫描深度，默认 3（1–10）
 *   --include-dirs <a,b>   只分析这些目录（相对 repo_path）
 *   --exclude-dirs <a,b>   额外排除目录（与默认排除目录合并）
 *   --language <lang>      语言提示：python/javascript/typescript/go/java/generic
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative, basename, resolve, sep } from "node:path";

// ── 常量 ────────────────────────────────────────────────────────────────
const DEFAULT_EXCLUDE_DIRS = [
  ".git", "node_modules", "dist", "build", "__pycache__",
  ".venv", "venv", "target", ".idea", ".vscode", ".pytest_cache",
  ".mypy_cache", "coverage",
];

const SOURCE_EXTS = new Set([
  ".py", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".go", ".java", ".kt",
  ".kts", ".rs", ".c", ".h", ".cpp", ".hpp", ".cc", ".rb", ".php", ".vue",
  ".svelte", ".md", ".json", ".yaml", ".yml", ".toml", ".xml", ".gradle",
  ".mod", ".sum", ".lock", ".txt", ".cfg", ".ini", ".sh", ".ps1",
]);

const SOURCE_SPECIAL = new Set(["Makefile", "Dockerfile", "Rakefile", "Gemfile"]);

const MAX_FILE_BYTES = 256 * 1000;

// ── 参数解析 ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const repoArg = args.find((a) => !a.startsWith("--"));
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

const maxDepth = clamp(Number(getArg("--max-depth", "3")) || 3, 1, 10);
const languageHint = getArg("--language", null);
const includeDirs = (getArg("--include-dirs", "") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const extraExclude = (getArg("--exclude-dirs", "") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const excludeDirs = new Set([...DEFAULT_EXCLUDE_DIRS, ...extraExclude]);

const mode = args.includes("--all") ? "all"
  : args.includes("--probe") ? "probe"
    : args.includes("--scan") ? "scan"
      : args.includes("--deps") ? "deps"
        : args.includes("--entry") ? "entry"
          : "all";

if (!repoArg) {
  console.error("用法: node arch-profile.mjs <repo_path> [--probe|--scan|--deps|--entry|--all] [--max-depth N] [--include-dirs a,b] [--exclude-dirs a,b] [--language L]");
  process.exit(2);
}

let root;
try {
  root = resolve(repoArg);
} catch {
  console.error("错误: repo_path 无效");
  process.exit(2);
}

// ── 工具函数 ────────────────────────────────────────────────────────────
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}
function isExcluded(name) {
  return excludeDirs.has(name) || name.startsWith(".git");
}
function readText(p) {
  try {
    if (!isFile(p)) return "";
    if (statSync(p).size > MAX_FILE_BYTES) return "";
    return readFileSync(p).toString("utf8");
  } catch {
    return "";
  }
}
function normalizePath(p) {
  return p.split(sep).join("/");
}
function relp(f) {
  return normalizePath(relative(root, f));
}
function posixDirname(rel) {
  const i = rel.lastIndexOf("/");
  return i <= 0 ? "" : rel.slice(0, i);
}
function basenamePosix(rel) {
  const i = rel.lastIndexOf("/");
  return i < 0 ? rel : rel.slice(i + 1);
}

// ── 遍历 ────────────────────────────────────────────────────────────────
function walk() {
  const files = [];
  const inc = includeDirs.length ? new Set(includeDirs) : null;
  function recur(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (isExcluded(e.name)) continue;
        if (inc && depth === 0 && !inc.has(e.name)) continue;
        recur(join(dir, e.name), depth + 1);
      } else if (e.isFile()) {
        files.push(join(dir, e.name));
      }
    }
  }
  recur(root, 0);
  return files;
}

function isSourceFile(rel) {
  const b = basenamePosix(rel);
  if (SOURCE_SPECIAL.has(b)) return true;
  const dot = b.lastIndexOf(".");
  if (dot < 0) return false;
  return SOURCE_EXTS.has(b.slice(dot).toLowerCase());
}

// ── 语言探测 ────────────────────────────────────────────────────────────
const LANG_MARKERS = [
  ["python", ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile"]],
  ["javascript", ["package.json"]],
  ["go", ["go.mod"]],
  ["java", ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle"]],
  ["kotlin", ["build.gradle.kts"]],
  ["rust", ["Cargo.toml"]],
  ["c", ["CMakeLists.txt", "Makefile", "meson.build"]],
  ["cpp", ["CMakeLists.txt"]],
  ["ruby", ["Gemfile", "Rakefile"]],
  ["php", ["composer.json"]],
];

function detectLanguage(files) {
  if (languageHint) return languageHint.toLowerCase();
  const has = (n) => existsSync(join(root, n));
  if (has("tsconfig.json") || has("pnpm-workspace.yaml")) return "typescript";
  for (const [lang, ms] of LANG_MARKERS) {
    for (const m of ms) {
      if (has(m)) return lang;
    }
  }
  for (const d of ["cmd", "internal", "pkg"]) {
    if (isDir(join(root, d))) return "go";
  }
  for (const d of ["src", "app", "lib"]) {
    if (!isDir(join(root, d))) continue;
    let py = 0;
    let js = 0;
    for (const f of files) {
      const rel = relp(f);
      if (!rel.startsWith(d + "/")) continue;
      const b = basenamePosix(rel).toLowerCase();
      if (b.endsWith(".py")) py++;
      else if (b.endsWith(".js") || b.endsWith(".ts")) js++;
    }
    if (py > js) return "python";
    if (js > 0) return "typescript";
  }
  return "generic";
}

// ── 项目信息 ────────────────────────────────────────────────────────────
function projectName() {
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    try {
      const data = JSON.parse(readText(pkg));
      if (typeof data.name === "string" && data.name) return data.name;
    } catch { /* ignore */ }
  }
  const py = join(root, "pyproject.toml");
  if (existsSync(py)) {
    for (const line of readText(py).split(/\r?\n/)) {
      const s = line.trim();
      if (s.startsWith("name") && s.includes("=")) {
        const v = s.split("=", 2)[1].trim().replace(/^["']/, "").replace(/["']$/, "");
        if (v) return v;
      }
    }
  }
  return basename(root) || "unknown";
}

function projectDescription() {
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    try {
      const data = JSON.parse(readText(pkg));
      if (typeof data.description === "string" && data.description) return data.description;
    } catch { /* ignore */ }
  }
  const py = join(root, "pyproject.toml");
  if (existsSync(py)) {
    let inProject = false;
    for (const line of readText(py).split(/\r?\n/)) {
      const s = line.trim();
      if (s === "[project]") { inProject = true; continue; }
      if (inProject && s.startsWith("[") && s !== "[project]") break;
      if (inProject && s.startsWith("description")) {
        const v = s.split("=", 2)[1].trim().replace(/^["']/, "").replace(/["']$/, "");
        if (v) return v;
      }
    }
  }
  for (const n of ["README.md", "README.rst", "README.txt", "README"]) {
    const f = join(root, n);
    if (existsSync(f)) {
      for (const line of readText(f).split(/\r?\n/)) {
        const s = line.trim();
        if (s.startsWith("# ")) return s.replace(/^#\s+/, "");
        if (s && !s.startsWith("![") && !s.startsWith("<!--")) return s.slice(0, 200);
      }
    }
  }
  return "";
}

function techStack(language) {
  const stack = [];
  if (language !== "generic") stack.push(language);
  if (
    existsSync(join(root, "Dockerfile")) ||
    existsSync(join(root, "docker-compose.yml")) ||
    existsSync(join(root, "docker-compose.yaml"))
  ) stack.push("docker");
  if (existsSync(join(root, "Makefile"))) stack.push("make");
  const py = join(root, "pyproject.toml");
  if (existsSync(py)) {
    const text = readText(py);
    for (const dep of ["fastapi", "flask", "django", "pytest", "celery", "uvicorn"]) {
      if (text.includes(dep)) stack.push(dep);
    }
  }
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    try {
      const data = JSON.parse(readText(pkg));
      const deps = { ...(data.dependencies || {}), ...(data.devDependencies || {}) };
      for (const dep of ["react", "vue", "angular", "express", "next", "nuxt", "typescript", "webpack", "vite"]) {
        if (deps[dep]) stack.push(dep);
      }
    } catch { /* ignore */ }
  }
  const gm = join(root, "go.mod");
  if (existsSync(gm)) {
    const text = readText(gm);
    for (const dep of ["gin", "echo", "fiber", "grpc"]) {
      if (text.includes(dep)) stack.push(dep);
    }
  }
  const pom = join(root, "pom.xml");
  if (existsSync(pom)) {
    const text = readText(pom);
    if (text.includes("spring-boot")) stack.push("spring-boot");
  }
  return [...new Set(stack)];
}

// ── 仓库类型 ────────────────────────────────────────────────────────────
function hasRunnableEntry(files) {
  for (const f of files) {
    const rel = relp(f);
    const b = basenamePosix(rel).toLowerCase();
    if (/^(main|app|server|worker|consumer|cli|index)\.(py|js|ts|jsx|tsx|mjs|cjs|go|java|rb|php|rs|kt)$/.test(b)) return true;
    if (rel.startsWith("bin/") || rel.startsWith("cmd/")) return true;
    if (b === "dockerfile" || b === "docker-compose.yml" || b === "docker-compose.yaml") return true;
  }
  return false;
}

function detectRepoType(files, hasEntry) {
  const top = new Set();
  for (const f of files) {
    const seg = relp(f).split("/")[0];
    if (seg) top.add(seg);
  }
  for (const m of ["packages", "apps", "services", "microservices"]) {
    if (top.has(m)) return "monorepo";
  }
  let serviceLike = 0;
  for (const t of top) {
    const p = join(root, t);
    if (!isDir(p)) continue;
    if (["Dockerfile", "main.go", "main.py", "package.json", "go.mod", "app.py", "server.js", "server.ts"].some((f) => existsSync(join(p, f)))) {
      serviceLike++;
    }
  }
  if (serviceLike > 1) return "microservices";
  const srcLike = ["src", "lib", "include"].some((d) => top.has(d));
  if (srcLike && !hasEntry) return "library";
  return "monolith";
}

// ── 模块扫描 ────────────────────────────────────────────────────────────
function listTopDirs() {
  const out = [];
  try {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory() && !isExcluded(e.name)) out.push(e.name);
    }
  } catch { /* ignore */ }
  return out;
}

function scanModules(files, language) {
  const srcFiles = files.map(relp).filter(isSourceFile).sort();
  const containers = [];
  const addContainer = (relDir) => {
    if (isDir(join(root, relDir))) containers.push(normalizePath(relDir));
  };
  if (language === "python") {
    for (const d of ["src", "app", "lib"]) addContainer(d);
    for (const top of listTopDirs()) {
      if (existsSync(join(root, top, "__init__.py"))) containers.push(top);
    }
  } else if (language === "javascript" || language === "typescript") {
    for (const d of ["src", "lib", "packages", "apps"]) addContainer(d);
  } else if (language === "go") {
    for (const d of ["cmd", "internal", "pkg"]) addContainer(d);
  } else if (language === "java" || language === "kotlin") {
    addContainer("src/main/java");
  } else {
    for (const d of ["src", "lib", "app", "packages"]) addContainer(d);
  }

  const modules = [];
  const seen = new Set();

  const addModule = (modRel) => {
    if (seen.has(modRel)) return;
    seen.add(modRel);
    const prefix = modRel + "/";
    const modFiles = srcFiles.filter((rel) => rel.startsWith(prefix));
    if (modFiles.length === 0) return;
    modules.push({
      name: basenamePosix(modRel),
      path: modRel,
      language,
      key_files: pickKeyFiles(modFiles),
      file_count: modFiles.length,
    });
  };

  for (const container of containers) {
    const abs = join(root, container);
    let subdirs = [];
    try {
      subdirs = readdirSync(abs, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !isExcluded(e.name))
        .map((e) => e.name);
    } catch { /* ignore */ }
    const direct = srcFiles.some((rel) => posixDirname(rel) === container);
    const subsWithSource = subdirs.filter((sd) =>
      srcFiles.some((rel) => rel.startsWith(container + "/" + sd + "/"))
    );
    if (subsWithSource.length > 0) {
      for (const sd of subsWithSource.sort()) addModule(container + "/" + sd);
    } else if (direct) {
      addModule(container);
    }
  }

  if (modules.length === 0) {
    for (const top of listTopDirs().sort()) {
      if (srcFiles.some((rel) => rel.startsWith(top + "/"))) addModule(top);
    }
  }

  return modules;
}

function pickKeyFiles(modFiles) {
  const scored = modFiles.map((rel) => {
    const b = basenamePosix(rel);
    let score = 0;
    if (/^readme/i.test(b)) score += 100;
    if (/^(main|app|server|index|cli|worker|__init__)\./.test(b)) score += 50;
    if (b === "router.py" || b === "service.py") score += 10;
    let size = 0;
    try { size = statSync(join(root, rel.split("/").join(sep))).size; } catch { /* ignore */ }
    score += Math.min(size / 1000, 20);
    return { rel, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.rel);
}

// ── 依赖分析 ────────────────────────────────────────────────────────────
const PY_STDLIB = new Set([
  "os", "sys", "json", "re", "io", "typing", "collections", "pathlib", "datetime",
  "time", "math", "random", "functools", "itertools", "abc", "argparse", "logging",
  "subprocess", "threading", "asyncio", "copy", "enum", "hashlib", "base64",
  "string", "textwrap", "warnings", "uuid", "dataclasses", "contextlib", "unittest",
  "shutil", "glob", "tempfile", "types", "http",
]);

const NODE_BUILTINS = new Set([
  "fs", "path", "os", "http", "https", "url", "crypto", "util", "stream", "events",
  "buffer", "process", "assert", "child_process", "zlib", "querystring", "net",
  "tls", "dns", "readline", "timers", "module", "vm", "worker_threads", "cluster",
  "perf_hooks", "fs/promises", "path/posix", "path/win32",
]);

const GO_STDLIB_PREFIX = new Set([
  "fmt", "net", "io", "os", "strings", "strconv", "errors", "context", "log",
  "time", "sync", "encoding", "math", "sort", "bytes", "bufio", "path", "reflect",
  "regexp", "runtime", "unicode", "crypto", "database", "flag", "html", "mime",
  "testing", "text", "container", "hash", "image", "index", "unsafe",
]);

function isStdlib(imp, language) {
  if (language === "python") return PY_STDLIB.has(imp);
  if (language === "javascript" || language === "typescript") {
    return imp.startsWith("node:") || NODE_BUILTINS.has(imp);
  }
  if (language === "go") return GO_STDLIB_PREFIX.has(imp.split("/")[0]);
  return false;
}

function categorize(imp) {
  const n = imp.toLowerCase();
  const web = ["fastapi", "flask", "django", "express", "next", "nuxt", "gin", "echo", "fiber", "spring-boot", "react", "vue", "angular", "vite", "webpack", "uvicorn", "gunicorn", "koa", "hapi", "svelte", "nestjs"];
  const db = ["sqlalchemy", "psycopg2", "psycopg", "pymysql", "mysql", "postgres", "redis", "prisma", "mongoose", "typeorm", "sequelize", "knex", "asyncpg", "aiosqlite", "sqlite3"];
  const test = ["pytest", "jest", "vitest", "mocha", "chai", "unittest", "cypress", "playwright"];
  const queue = ["celery", "bullmq", "bull", "kafka", "kafkajs", "rabbitmq", "amqp", "pika", "dramatiq", "rq"];
  if (web.some((w) => n.includes(w))) return "web";
  if (db.some((w) => n.includes(w))) return "database";
  if (test.some((w) => n.includes(w))) return "test";
  if (queue.some((w) => n.includes(w))) return "queue";
  return "library";
}

function extractImports(text, language) {
  const out = [];
  if (language === "python") {
    const re = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1] || m[2];
      if (name && !name.startsWith(".")) out.push(name);
    }
  } else if (language === "javascript" || language === "typescript") {
    const re = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
    const re2 = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = re2.exec(text))) out.push(m[1]);
    const re3 = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = re3.exec(text))) out.push(m[1]);
  } else if (language === "go") {
    const blockRe = /import\s*\(\s*([\s\S]*?)\)/g;
    let m;
    while ((m = blockRe.exec(text))) {
      const q = /["\`]([^"\`]+)["\`]/g;
      let qm;
      while ((qm = q.exec(m[1]))) out.push(qm[1]);
    }
    const noBlock = text.replace(/import\s*\(\s*[\s\S]*?\)/g, "");
    const single = /import\s+["\`]([^"\`]+)["\`]/g;
    while ((m = single.exec(noBlock))) out.push(m[1]);
  } else if (language === "java" || language === "kotlin") {
    const re = /^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm;
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  }
  return [...new Set(out)];
}

function findModuleForFile(rel, modulesSorted) {
  for (const m of modulesSorted) {
    if (rel === m.path || rel.startsWith(m.path + "/")) return m;
  }
  return null;
}

function matchModule(imp, modulesSorted) {
  let clean = imp.replace(/^\.\.?\//, "").replace(/^\./, "");
  if (!clean) return null;
  const firstSeg = clean.split(/[./]/)[0];
  for (const m of modulesSorted) {
    if (m.name === firstSeg) return m;
  }
  const dotted = clean.split("/").join(".");
  for (const m of modulesSorted) {
    const mp = m.path.split("/").join(".");
    if (dotted === mp || dotted.startsWith(mp + ".")) return m;
  }
  for (const m of modulesSorted) {
    if (clean === m.path || clean.endsWith("/" + m.path) || clean.startsWith(m.path + "/") || clean.includes("/" + m.path + "/")) return m;
  }
  return null;
}

function isSourceCode(rel, language) {
  const b = basenamePosix(rel).toLowerCase();
  if (language === "python") return b.endsWith(".py");
  if (language === "javascript" || language === "typescript") return /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(b);
  if (language === "go") return b.endsWith(".go");
  if (language === "java" || language === "kotlin") return /\.(java|kt|kts)$/.test(b);
  if (language === "rust") return b.endsWith(".rs");
  if (language === "ruby") return b.endsWith(".rb");
  if (language === "php") return b.endsWith(".php");
  return /\.(py|js|ts|jsx|tsx|mjs|cjs|go|java|kt|kts|rs|rb|php)$/.test(b);
}

function cleanVersion(dep, name) {
  let v = dep.replace(name, "").trim();
  v = v.replace(/^[<>=~!^]+/, "").trim();
  return v || "";
}

function manifestVersions(language) {
  const map = {};
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    try {
      const d = JSON.parse(readText(pkg));
      for (const [k, v] of Object.entries({ ...(d.dependencies || {}), ...(d.devDependencies || {}) })) {
        map[k] = cleanVersion(typeof v === "string" ? v : "", k);
      }
    } catch { /* ignore */ }
  }
  const py = join(root, "pyproject.toml");
  if (existsSync(py)) {
    const text = readText(py);
    let inDeps = false;
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (/^\[project\]/.test(s)) { inDeps = false; continue; }
      if (/^\[/.test(s)) { inDeps = false; continue; }
      if (/^dependencies\s*=\s*\[/.test(s)) { inDeps = true; continue; }
      if (inDeps) {
        if (/\]/.test(s)) inDeps = false;
        const m = s.match(/^["']([^"']+)["']\s*,?\s*$/);
        if (m) {
          const dep = m[1];
          const name = dep.split(/[<>=!~\[]/)[0].trim();
          if (name) map[name] = cleanVersion(dep, name);
        }
      }
    }
  }
  const gm = join(root, "go.mod");
  if (existsSync(gm)) {
    const text = readText(gm);
    for (const m of text.matchAll(/^\s*require\s+([\w./-]+)\s+([\w.+-]+)/gm)) {
      map[m[1]] = m[2];
    }
    const block = text.match(/require\s*\(([\s\S]*?)\)/);
    if (block) {
      for (const m of block[1].matchAll(/^\s*([\w./-]+)\s+([\w.+-]+)/gm)) {
        map[m[1]] = m[2];
      }
    }
  }
  return map;
}

function analyzeDeps(files, modules, language) {
  const internal = [];
  const external = [];
  const externalSeen = new Set();
  const internalSeen = new Set();
  const modulesSorted = [...modules].sort((a, b) => b.path.length - a.path.length);

  for (const f of files) {
    const rel = relp(f);
    if (!isSourceCode(rel, language)) continue;
    const text = readText(f);
    if (!text) continue;
    const sourceModule = findModuleForFile(rel, modulesSorted);
    for (const imp of extractImports(text, language)) {
      const target = matchModule(imp, modulesSorted);
      if (target) {
        if (sourceModule && target.name !== sourceModule.name) {
          const key = sourceModule.name + "->" + target.name;
          if (!internalSeen.has(key)) {
            internalSeen.add(key);
            internal.push({ source: sourceModule.name, target: target.name, kind: "import", path: rel });
          }
        }
      } else if (!imp.startsWith(".") && !imp.startsWith("/") && !isStdlib(imp, language)) {
        if (!externalSeen.has(imp)) {
          externalSeen.add(imp);
          external.push({ name: imp, version: "", category: categorize(imp) });
        }
      }
    }
  }

  const versions = manifestVersions(language);
  for (const e of external) {
    if (versions[e.name] !== undefined) e.version = versions[e.name];
  }

  return { internal, external };
}

// ── 入口点 ──────────────────────────────────────────────────────────────
function entryCandidates(files) {
  const out = [];
  for (const f of files) {
    const rel = relp(f);
    const b = basenamePosix(rel).toLowerCase();
    if (/^(main|app|server|worker|consumer|cli|index)\.(py|js|ts|jsx|tsx|mjs|cjs|go|java|rb|php|rs|kt)$/.test(b)) { out.push(f); continue; }
    if (b === "application.java" || b === "application.kt") { out.push(f); continue; }
    if (rel.startsWith("bin/") || rel.startsWith("cmd/")) { out.push(f); continue; }
  }
  return out;
}

function classifyEntry(b, rel, text) {
  const t = text.toLowerCase();
  const inBinCmd = rel.startsWith("bin/") || rel.startsWith("cmd/");
  if (/(uvicorn|fastapi|flask|django|express|app\.listen|\.listen\(|http\.createserver|http\.listenandserve|gin\.new|gin\.default|echo\.new|@springbootapplication)/.test(t)) return "web";
  if (/^(server|app)\.(js|ts|mjs|cjs|jsx|tsx)$/.test(b) || b === "index.js" || b === "index.ts") return "web";
  if (/(worker|consumer|celery|bullmq|queue)/.test(b) || /(celery|bullmq|kafka)/.test(t)) return "worker";
  if (/(cron|scheduler|schedule)/.test(b)) return "scheduler";
  if (inBinCmd || /(argparse|commander|cobra|click|yargs|process\.argv|urfave\/cli)/.test(t) || /^cli\.(py|js|ts|go|rb|php)$/.test(b)) return "cli";
  if (b === "main.go" || b === "application.java" || b === "application.kt") return "web";
  if (/^main\.(py|js|ts)$/.test(b)) {
    if (/(argparse|click|commander|yargs|process\.argv|cobra)/.test(t)) return "cli";
    return "web";
  }
  return null;
}

function inferCommand(rel, type, language) {
  if (language === "python") {
    if (type === "web") return "uvicorn " + rel.replace(/\.py$/, "").split("/").join(".") + ":app --reload";
    return "python " + rel;
  }
  if (language === "javascript" || language === "typescript") return "node " + rel;
  if (language === "go") return "go run ./" + posixDirname(rel);
  if (language === "java" || language === "kotlin") return "mvn -q spring-boot:run";
  return rel;
}

function findLibraryFile(files, language) {
  const rels = files.map(relp);
  if (language === "rust") {
    const l = rels.find((r) => basenamePosix(r) === "lib.rs");
    if (l) return l;
  }
  if (language === "javascript" || language === "typescript") {
    const l = rels.find((r) => basenamePosix(r) === "index.ts" || basenamePosix(r) === "index.js");
    if (l) return l;
  }
  if (language === "python") {
    const l = rels.find((r) => basenamePosix(r) === "__init__.py");
    if (l) return l;
  }
  return null;
}

function detectEntryPoints(files, language) {
  const entries = [];
  const seen = new Set();
  for (const f of entryCandidates(files)) {
    const rel = relp(f);
    const b = basenamePosix(rel).toLowerCase();
    const text = readText(f);
    const type = classifyEntry(b, rel, text);
    if (!type) continue;
    const key = type + "|" + rel;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ type, path: rel, command: inferCommand(rel, type, language), description: "" });
  }
  if (entries.length === 0) {
    const lib = findLibraryFile(files, language);
    if (lib) entries.push({ type: "library", path: lib, command: "", description: "" });
  }
  return entries;
}

// ── 运行方式 ────────────────────────────────────────────────────────────
function mapScriptAction(name) {
  const m = {
    install: "install", dev: "dev", develop: "dev", start: "run", serve: "run",
    build: "build", test: "test", deploy: "deploy", lint: "other",
    format: "other", typecheck: "other", check: "test", ci: "test",
  };
  return m[name] || "other";
}

function parsePyprojectScripts(text) {
  const out = [];
  let inScripts = false;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (/^\[project\.scripts\]/.test(s)) { inScripts = true; continue; }
    if (inScripts && /^\s*\[/.test(s)) { inScripts = false; continue; }
    if (inScripts) {
      const m = s.match(/^([\w-]+)\s*=\s*["']?([^"'\s]+)["']?\s*$/);
      if (m) out.push({ name: m[1], target: m[2] });
    }
  }
  return out;
}

function extractRunMethods(language) {
  const methods = [];
  const seen = new Set();
  const add = (action, command, workspace) => {
    if (!command) return;
    const key = action + "|" + command;
    if (seen.has(key)) return;
    seen.add(key);
    methods.push({ action, command, workspace: workspace || "." });
  };

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    let pkg = {};
    try { pkg = JSON.parse(readText(pkgPath)); } catch { /* ignore */ }
    add("install", "npm install", ".");
    const scripts = pkg.scripts || {};
    for (const name of Object.keys(scripts)) {
      const action = mapScriptAction(name);
      add(action, action === "run" ? "npm start" : "npm run " + name, ".");
    }
  }

  const pyPath = join(root, "pyproject.toml");
  if (existsSync(pyPath)) {
    const text = readText(pyPath);
    add("install", "pip install -e .", ".");
    for (const s of parsePyprojectScripts(text)) add("run", s.name, ".");
    if (/uvicorn/.test(text)) add("dev", "uvicorn src.main:app --reload", ".");
  }

  const mk = join(root, "Makefile");
  if (existsSync(mk)) {
    const text = readText(mk);
    for (const m of text.matchAll(/^([a-zA-Z0-9_.-]+)\s*:/gm)) {
      add(mapScriptAction(m[1]), "make " + m[1], ".");
    }
  }

  const df = join(root, "Dockerfile");
  if (existsSync(df)) {
    const name = basename(root);
    add("build", "docker build -t " + name + " .", ".");
    add("run", "docker run " + name, ".");
  }

  const dc = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]
    .map((n) => join(root, n)).find((p) => existsSync(p));
  if (dc) {
    add("deploy", "docker compose up -d", ".");
    add("other", "docker compose down", ".");
  }

  return methods;
}

// ── 目录树 ──────────────────────────────────────────────────────────────
function renderTree(depth) {
  const lines = [];
  lines.push((basename(root) || ".") + "/");
  function walkDir(dir, prefix, d) {
    if (d >= depth) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => !(e.isDirectory() && isExcluded(e.name)));
    } catch { return; }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    entries.forEach((e, i) => {
      const last = i === entries.length - 1;
      const branch = last ? "└── " : "├── ";
      if (e.isDirectory()) {
        lines.push(prefix + branch + e.name + "/");
        walkDir(join(dir, e.name), prefix + (last ? "    " : "│   "), d + 1);
      } else {
        lines.push(prefix + branch + e.name);
      }
    });
  }
  walkDir(root, "", 0);
  return lines.join("\n");
}

// ── 风险（动态导入） ────────────────────────────────────────────────────
function detectRisks(files, language) {
  const risks = [];
  for (const f of files) {
    const rel = relp(f);
    if (!isSourceCode(rel, language)) continue;
    const text = readText(f);
    if (!text) continue;
    if (language === "python" && /importlib|__import__/.test(text)) {
      risks.push(rel + " 使用 importlib/__import__ 动态导入，依赖关系可能不完整");
    }
    if ((language === "javascript" || language === "typescript") && /require\(\s*[a-zA-Z_$]/.test(text)) {
      risks.push(rel + " 使用变量 require，依赖关系可能不完整");
    }
  }
  return risks;
}

// ── 主流程 ──────────────────────────────────────────────────────────────
if (!isDir(root)) {
  console.error("错误: repo_path 不存在或不是目录: " + repoArg);
  process.exit(2);
}

const files = walk();
const language = detectLanguage(files);
const modules = scanModules(files, language);
const dependencies = analyzeDeps(files, modules, language);
const entry_points = detectEntryPoints(files, language);
const run_methods = extractRunMethods(language);
const repo_type = detectRepoType(files, hasRunnableEntry(files));
const project = {
  name: projectName(),
  root: normalizePath(root),
  language,
  repo_type,
  description: projectDescription(),
  tech_stack: techStack(language),
};

const print = (obj) => console.log(JSON.stringify(obj, null, 2));

if (mode === "probe") {
  print({ project });
} else if (mode === "scan") {
  print({ modules });
} else if (mode === "deps") {
  print({ dependencies });
} else if (mode === "entry") {
  print({ entry_points, run_methods });
} else {
  print({
    project,
    modules: modules.map((m) => ({
      name: m.name,
      path: m.path,
      responsibility: "",
      language: m.language,
      key_files: m.key_files,
      file_count: m.file_count,
    })),
    dependencies,
    entry_points,
    run_methods,
    key_flows: [],
    directory_tree: renderTree(Math.min(maxDepth, 5)),
    risks: detectRisks(files, language),
  });
}
