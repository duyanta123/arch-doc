# arch-doc 插件详细实现文档

> 版本：1.0（方案稿）
> 目标仓库：`https://github.com/duyanta123/arch-doc.git`
> 说明：本文档只描述实现方案，不含对现有目录/代码的改动。提交 dsh-index 之前的全部实现内容均以此文档为准。

---

## 1. 目标与边界

### 1.1 目标

做一个名为 `arch-doc` 的 DSH 标准技能插件：输入一个代码库路径，自动生成架构文档，覆盖：

1. 项目概览（技术栈、架构风格）
2. 模块职责（每个模块/包/服务职责）
3. 依赖关系（内部依赖 + 外部依赖 + Mermaid 图）
4. 入口点（CLI / Web / Worker / Scheduler / Library）
5. 运行方式（安装、开发、构建、测试、运行、部署）
6. 关键流程（可选，LLM 总结）

### 1.2 边界

- **做**：确定性扫描、依赖提取、入口点发现、文档生成、标准 Bundle 打包。
- **不做（本阶段）**：不提交 dsh-index、不发布 npm、不联网拉取远程仓库、不做增量更新。
- **运行形态**：DSH 技能插件（npm 包 + `skills/arch-doc/SKILL.md`），与 `dsh-data-insight` 保持同一标准。

---

## 2. 总体架构

```
代码库路径
    │
    ▼
┌─────────────────────────────┐
│ 阶段 0：输入受理             │  校验 repo_path，确认输出格式/目录/扫描范围
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 阶段 1：仓库探测             │  scripts/arch-profile.mjs --probe
│  语言 / 构建系统 / 仓库类型   │  输出 project + tech_stack + repo_type
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 阶段 2：模块扫描             │  scripts/arch-profile.mjs --scan
│  目录树 / 模块划分 / 关键文件  │  输出 modules[]
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 阶段 3：依赖分析             │  scripts/arch-profile.mjs --deps
│  内部依赖图 / 外部依赖清单     │  输出 dependencies{internal[], external[]}
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 阶段 4：入口点与运行方式      │  scripts/arch-profile.mjs --entry
│  CLI/Web/Worker/Library       │  输出 entry_points[] + run_methods[]
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 阶段 5：文档生成             │  LLM 按模板汇总 + 脚本事实数据
│  Markdown / JSON / Mermaid    │  输出 docs/ARCHITECTURE.md 等
└─────────────────────────────┘
```

原则：

> **脚本只产出“硬事实”（目录、文件、import、命令、入口候选）；LLM 只做“语义总结”（模块职责、项目描述、关键流程、风险）。**

---

## 3. 标准 Bundle 目录结构

与 `dsh-data-insight` 同一套 DSH npm bundle 规范：

```text
arch-doc/
├── package.json                  # npm 包 + dsh.bundle.patch
├── cordis.patch.yml              # DSH bundle patch（插入插件行）
├── plugin/
│   └── index.js                  # ESM 入口，注册 skills/ 为技能根
├── skills/
│   └── arch-doc/
│       └── SKILL.md              # 技能 frontmatter + 阶段执行 runbook
├── docs/
│   ├── architecture-template.md  # Markdown 输出模板 + 检查清单
│   └── scanning-rules.md         # 各语言扫描/依赖/入口识别规则（可选）
├── scripts/
│   └── arch-profile.mjs          # 零依赖 Node 脚本：probe/scan/deps/entry
├── examples/
│   ├── input.json                # 输入示例
│   ├── sample-output.md          # 输出 Markdown 示例
│   └── sample-output.json        # 输出 JSON 示例
├── test/
│   ├── arch-profile.test.mjs     # node --test 测试
│   └── fixtures/
│       ├── python-app/           # 最小 Python fixture
│       ├── node-app/             # 最小 Node fixture
│       └── go-app/               # 最小 Go fixture
├── README.md
├── CHANGELOG.md
├── PUBLISHING.md                 # 发布到 GitHub / npm / dsh-index 步骤
├── LICENSE
└── .gitignore
```

与 `dsh-data-insight` 保持一致的关键点：
- `package.json` 的 `files` 字段必须包含 `plugin/index.js`、`cordis.patch.yml`、`skills/`、`docs/`、`scripts/`、`examples/`、`README.md`、`LICENSE` 等。
- `peerDependencies` 使用 `@deepseek-ai/dsh-skill-filesystem`。
- `plugin/index.js` 使用 `FileSystemSkillProvider` 注册 `skills/` 目录，`includeDefaultRoots: false`。
- `cordis.patch.yml` 只插入插件行，不重复声明宿主 profile 已有工具。

---

## 4. 各文件详细设计

### 4.1 `package.json`

```json
{
  "name": "arch-doc",
  "version": "0.1.0",
  "description": "DSH arch-doc skill plugin: analyze a codebase and generate architecture documentation (module responsibilities, dependencies, entry points and run methods).",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "test": "node --test test/arch-profile.test.mjs"
  },
  "main": "./plugin/index.js",
  "exports": {
    ".": "./plugin/index.js",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "files": [
    "plugin/index.js",
    "cordis.patch.yml",
    "skills/",
    "docs/",
    "scripts/",
    "examples/",
    "README.md",
    "CHANGELOG.md",
    "PUBLISHING.md",
    "LICENSE"
  ],
  "peerDependencies": {
    "@deepseek-ai/dsh-skill-filesystem": "*"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/dsh-skill-filesystem": {
      "optional": true
    }
  },
  "keywords": [
    "dsh",
    "dsh-plugin",
    "deepseek-harness",
    "architecture",
    "documentation",
    "code-analysis",
    "dependency-graph",
    "skills"
  ]
}
```

### 4.2 `cordis.patch.yml`

```yaml
# arch-doc — DSH bundle patch.
# 当 profile 在 dsh.profile.bundles 中列出本包时，
# dsh 启动时插入本包插件行，加载 package.json 的 main（plugin/index.js），
# 将自带 skills/ 注册为技能根。
- insert:
    - id: arch-doc
      name: arch-doc
```

### 4.3 `plugin/index.js`

与 `dsh-data-insight/plugin/index.js` 同构：

```js
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FileSystemSkillProvider } from "@deepseek-ai/dsh-skill-filesystem";

export const name = "arch-doc";
export const inject = ["skills"];

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(rootDir, "skills");

export function apply(ctx, config = {}) {
  let provider;
  ctx.skills.registerProvider((control) => {
    provider = new FileSystemSkillProvider(ctx, control, {
      providerName: "arch-doc",
      includeDefaultRoots: false,
      customSkillDirs: [skillsDir],
      ...config,
    });
    return provider;
  });
  ctx.effect(
    function* () {
      yield async () => {
        await provider?.dispose();
      };
    },
    "arch-doc skill provider"
  );
}
```

### 4.4 `skills/arch-doc/SKILL.md`

#### frontmatter

```markdown
---
name: arch-doc
description: 架构文档生成：输入一个代码库路径，自动分析模块职责、依赖关系、入口点与运行方式，输出结构化 Markdown 架构文档与 JSON。需要读懂项目结构、生成架构文档、梳理模块依赖、整理启动/构建/测试命令时加载本技能。
---
```

#### 正文结构（runbook）

```markdown
# arch-doc Runbook

把代码库变成「模块职责 + 依赖关系 + 入口点 + 运行方式」的结构化架构文档。

## 执行原则
1. 区分事实与推断：目录/import/命令来自脚本事实，模块职责/项目描述/关键流程由 LLM 总结，并标注推断。
2. 不编造：读不到的信息写「未识别」，不猜测入口和依赖。
3. 可复现：附录记录扫描范围、排除目录、脚本命令与版本。
4. 大仓库保护：>2000 个源文件或目录深度 >5 时，先扫描顶层模块，禁止逐文件通读。

## 阶段 0：输入受理
- 识别用户输入：repo_path（必填）；output_format（markdown/json/both，默认 markdown）；output_path（默认 <repo>/docs）；max_depth（默认 3）；include_dirs；exclude_dirs；language。
- 缺少 repo_path 时用 ask_user_question 一次问清。
- 门槛：repo_path 存在且为目录，输出目录可写。

## 阶段 1：仓库探测
- 优先调用 `node scripts/arch-profile.mjs <repo> --probe`。
- 无 Node 时降级：用 shell 的 ls/find 手工探测。
- 输出：project.name、language、repo_type、tech_stack、description。

## 阶段 2：模块扫描
- 调用 `node scripts/arch-profile.mjs <repo> --scan --max-depth 3`。
- 脚本按语言规则划分模块并输出 modules[]（name/path/key_files）。
- LLM 对每个模块补充 responsibility：读模块 README、文件头注释、类/函数名；信息不足时总结关键文件。

## 阶段 3：依赖分析
- 调用 `node scripts/arch-profile.mjs <repo> --deps`。
- 脚本输出 dependencies.internal[]（source/target/kind/path）与 dependencies.external[]（name/version/category）。
- LLM 只做环检测提醒与「待确认风险」标注。

## 阶段 4：入口点与运行方式
- 调用 `node scripts/arch-profile.mjs <repo> --entry`。
- 脚本输出 entry_points[] 与 run_methods[]（来自 package.json scripts、pyproject [project.scripts]、Dockerfile、Makefile 等）。
- LLM 为每个入口补一句说明。

## 阶段 5：文档产出
- 严格按 docs/architecture-template.md 骨架生成。
- 默认输出：
  - docs/ARCHITECTURE.md
  - docs/architecture.json
  - docs/diagrams/module-dependencies.mmd
- 门槛：每个模块有职责、每条依赖有来源、每个入口有路径/命令、每个 run_method 可复现。
```

### 4.5 `docs/architecture-template.md`

```markdown
# 架构文档模板

固定章节顺序：

# 架构文档

## 1. 项目概览
- 项目名称、一句话描述、架构风格（分层/模块化/微服务/插件化）、仓库类型（monolith/monorepo/library/microservices）。

## 2. 技术栈
- 语言、框架、构建工具、数据库/中间件（仅列能在仓库中确认的）。

## 3. 目录结构
- 代码块 tree，最多 3 层，排除 node_modules/.git/dist/build 等噪音。

## 4. 模块职责
| 模块 | 路径 | 职责 | 关键文件 |
|---|---|---|---|

## 5. 模块依赖关系
- 内部依赖表：source -> target（kind）
- Mermaid 图：
  ```mermaid
  graph TD
    api --> auth
    auth --> db
  ```

## 6. 入口点
| 类型 | 路径 | 启动命令 | 说明 |
|---|---|---|---|

## 7. 运行方式
| 操作 | 命令 | 工作目录 |
|---|---|---|

## 8. 关键流程
- 1–3 条核心链路，每条 3–7 步，必须基于已识别入口与依赖。

## 9. 待确认/风险点
- 动态导入、反射调用、隐式依赖、无法确定的外部服务等。

## 附录
- 扫描范围、排除目录、脚本命令、生成时间。
```

### 4.6 `scripts/arch-profile.mjs`

零依赖 Node ESM 脚本，只做纯文件读写与计算，**不 spawn 子进程**（规避 DSH 沙箱 EPERM）。

#### 调用方式

```bash
node scripts/arch-profile.mjs <repo_path> --probe
node scripts/arch-profile.mjs <repo_path> --scan --max-depth 3
node scripts/arch-profile.mjs <repo_path> --deps
node scripts/arch-profile.mjs <repo_path> --entry
node scripts/arch-profile.mjs <repo_path> --all   # 一次输出完整 JSON
```

#### 公共参数

- `<repo_path>`：必填，代码库根目录。
- `--max-depth`：默认 3。
- `--include-dirs`：逗号分隔。
- `--exclude-dirs`：逗号分隔，默认 `.git,node_modules,dist,build,__pycache__,.venv,venv,target,.idea,.vscode`。
- `--language`：可指定 `python/javascript/typescript/go/java/generic`。

#### 脚本内部模块划分

```js
const scanModule = {
  name: "scanModule",
  run: (root, files, lang) => {
    // 1. 过滤排除目录与二进制文件
    // 2. 按顶层目录聚合源文件
    // 3. 语言启发式：
    //    Python: src/<pkg>, app/, lib/, 顶层包目录
    //    Node:   src/, packages/, apps/, lib/
    //    Go:     cmd/, internal/, pkg/
    //    Java:   src/main/java/<package 前两级>
    // 4. 每个模块输出：name, path, key_files(前 5 个), file_count
  }
};
```

#### 依赖提取正则（确定性规则）

| 语言 | 正则/规则 |
|---|---|
| Python | `^\s*(?:from\s+([\w.]+)\s+import\|import\s+([\w.]+))` |
| JavaScript/TypeScript | `import ... from '...'`、`import '...'`、`require('...')` |
| Go | 单行 `import "..."` 与 `import (...)` 块 |
| Java/Kotlin | `^\s*import\s+([\w.]+);` |

内部依赖判定：导入路径的首段命中某个模块名或模块路径；否则归入外部依赖。

#### 入口点判定规则

| 类型 | 判定依据 |
|---|---|
| web | `server.js/app.py/main.go/Application.java` + 端口/路由关键词；或 Dockerfile 暴露 80/443/3000/8000/8080 |
| cli | `bin/`, `cmd/`, `cli.py`, `cli.js`, `main.py` + argparse/commander/cobra |
| worker | `worker`, `consumer`, `queue`, `jobs`, `celery`, `bullmq` |
| scheduler | `cron`, `scheduler`, `schedule` |
| library | 无运行入口，有 `lib.rs`/`index.ts` 导出/`setup.py` 包名 |

#### 运行方式提取规则

| 来源 | 提取 |
|---|---|
| `package.json` scripts | install/dev/build/test/start/deploy 等命令 |
| `pyproject.toml` | `[project.scripts]`、dependencies、optional-dependencies |
| `Makefile` | 目标名与命令 |
| `Dockerfile` | FROM/RUN/CMD/ENTRYPOINT 对应的 build/run |
| `docker-compose.yml` | service 名对应的 up/deploy |
| `README.md` | 出现 `npm run` / `pip install` / `go build` / `mvn` 等命令时提取为候选 |

#### 输出 JSON（`--all`）

与 `examples/sample-output.json` 结构一致，见第 6 节。

### 4.7 `examples/input.json`

```json
{
  "repo_path": "/path/to/my-app",
  "output_format": "both",
  "output_path": "/path/to/my-app/docs",
  "max_depth": 3,
  "exclude_dirs": [".git", "node_modules", "dist", "build", "__pycache__", ".venv"],
  "generate_mermaid": true
}
```

### 4.8 `README.md`

```markdown
# arch-doc

DSH 技能插件：输入代码库路径，自动生成架构文档（模块职责、依赖关系、入口点、运行方式）。

## 能力
- 项目类型/语言/构建系统识别
- 模块划分与职责总结
- 内部/外部依赖提取与 Mermaid 依赖图
- 入口点（CLI/Web/Worker/Scheduler/Library）识别
- 运行方式（安装/开发/构建/测试/运行/部署）提取
- 输出 Markdown + JSON

## 使用
1. 安装：`dsh plugin --profile web add github:duyanta123/arch-doc#v0.1.0`
2. 使用：对 Agent 说「用 arch-doc 分析 /path/to/repo」
3. 本地开发：profile 的 package.json 加 `"arch-doc": "file:D:/.../arch-doc"`，bundles 加 `"arch-doc"`

## 测试
npm test
```

### 4.9 `PUBLISHING.md`

记录从源码到分发的步骤，与 `dsh-data-insight/PUBLISHING.md` 同构，但**截止到「准备提交 dsh-index」为止**：

1. 本地实现与测试：`node --check scripts/arch-profile.mjs`、`npm test`、JSON schema 校验。
2. `git init` + commit，创建 GitHub 仓库 `duyanta123/arch-doc`，push main 与 tag `v0.1.0`。
3. 在 profile 中本地 `file:` 安装验证技能出现与输出正确。
4. 准备 dsh-index 提交物：`skills/arch-doc` 目录（SKILL.md + 本包元数据）。
5. **停下点：不执行 dsh-index PR 提交。** 检查清单全过后等待下一步指令。

---

## 5. 输入输出约定

### 5.1 输入参数

| 参数 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| repo_path | 是 | - | 代码库本地路径 |
| output_format | 否 | markdown | markdown / json / both |
| output_path | 否 | `<repo>/docs` | 输出目录 |
| max_depth | 否 | 3 | 目录扫描深度 1–10 |
| include_dirs | 否 | [] | 只分析这些目录 |
| exclude_dirs | 否 | 常见噪音目录 | 排除目录 |
| language | 否 | auto | 语言提示 |
| generate_mermaid | 否 | true | 是否生成 Mermaid 图 |

### 5.2 输出文件

```text
docs/
├── ARCHITECTURE.md
├── architecture.json
└── diagrams/
    └── module-dependencies.mmd
```

### 5.3 JSON 输出结构

```json
{
  "project": {
    "name": "my-app",
    "root": "/path/to/my-app",
    "language": "python",
    "repo_type": "monolith",
    "description": "示例项目",
    "tech_stack": ["python", "fastapi", "docker"]
  },
  "modules": [
    {
      "name": "auth",
      "path": "src/auth",
      "responsibility": "用户认证与权限控制",
      "language": "python",
      "key_files": ["src/auth/service.py"]
    }
  ],
  "dependencies": {
    "internal": [
      { "source": "api", "target": "auth", "kind": "import", "path": "src/api/router.py" }
    ],
    "external": [
      { "name": "fastapi", "version": "0.115.0", "category": "web" }
    ]
  },
  "entry_points": [
    { "type": "web", "path": "src/main.py", "command": "uvicorn src.main:app --reload", "description": "API 服务入口" }
  ],
  "run_methods": [
    { "action": "install", "command": "pip install -e .", "workspace": "." },
    { "action": "dev", "command": "uvicorn src.main:app --reload", "workspace": "." }
  ],
  "key_flows": [
    { "name": "用户登录", "description": "登录请求处理链路", "steps": ["接收请求", "校验参数", "调用 auth 服务", "返回 token"] }
  ],
  "directory_tree": "src/\n├── api/\n├── auth/\n└── main.py",
  "risks": ["auth 模块通过 importlib 动态加载，需人工确认"]
}
```

### 5.4 Markdown 输出结构

见 `docs/architecture-template.md`，章节固定：项目概览 → 技术栈 → 目录结构 → 模块职责 → 模块依赖关系 → 入口点 → 运行方式 → 关键流程 → 待确认/风险点 → 附录。

---

## 6. 核心实现要点

### 6.1 项目探测

- 按文件优先级识别语言：
  - Python：`pyproject.toml` / `setup.py` / `requirements.txt`
  - JavaScript：`package.json`
  - TypeScript：`tsconfig.json` / `pnpm-workspace.yaml`
  - Go：`go.mod` / `cmd/` / `internal/`
  - Java：`pom.xml` / `build.gradle`
  - 无标识文件 → `generic`，用目录结构启发式
- 仓库类型：
  - 顶层存在 `packages/`、`apps/`、`services/` → `monorepo`
  - 多个子目录各自有 `Dockerfile` / `main.go` / `package.json` → `microservices`
  - 有 `src/` 且无运行入口 → `library`
  - 其余 → `monolith`

### 6.2 模块扫描

- 排除：`.git`、`node_modules`、`dist`、`build`、`__pycache__`、`.venv`、`venv`、`target`、`.idea`、`.vscode`。
- 文件类型白名单：源码、配置、Manifest、README。
- 模块边界：按语言惯例取顶层源目录；每模块输出 `path` 和 `key_files`（最多 5 个，优先 README、入口、大文件）。

### 6.3 依赖分析

- 只做**静态文本解析**，不做 AST（保持零依赖与快速度）。
- 内部依赖：导入路径首段匹配已知模块名。
- 外部依赖：未匹配内部模块的导入；再从 Manifest 补版本。
- 对动态 import（`importlib`、`require(variable)`）标记风险，不硬猜。

### 6.4 入口点与运行方式

- 入口点必须来自「文件名 + 关键词 + Manifest 命令」三类证据之一。
- 运行命令优先从 Manifest 提取；README 中的命令只作为候选，需标注来源。
- 无法判断类型时使用 `unknown`，不强行分类。

### 6.5 文档生成

- 硬数据来自 `scripts/arch-profile.mjs --all`。
- LLM 补充字段：`modules[].responsibility`、`project.description`、`entry_points[].description`、`key_flows[]`、`risks[]`。
- 生成顺序：先 JSON（机器可读），再 Markdown（人类可读），最后 Mermaid（可视图）。
- Mermaid 节点使用模块名，边为 `source --> target`，孤立模块也保留节点。

---

## 7. 测试方案

### 7.1 测试文件

`test/arch-profile.test.mjs`，使用 `node --test` 运行。

### 7.2 用例

| 用例 | 验证点 |
|---|---|
| probe-python | 正确识别 python + repo_type |
| probe-node | 正确识别 javascript + package.json 命令 |
| scan-python | src 下模块划分正确、排除目录生效 |
| deps-python | `from auth.service import ...` 生成 api->auth 内部依赖 |
| deps-external | fastapi 归入 external |
| entry-web | 识别 `src/main.py` + uvicorn 为 web 入口 |
| entry-cli | 识别 `bin/` 或 `cli.py` |
| run-methods | 从 package.json scripts 提取 dev/build/test |
| output-json | `--all` 输出符合 JSON 结构且字段齐全 |
| skip-excluded | node_modules 下文件不参与扫描 |

### 7.3 Fixture 设计

- `python-app/`：`pyproject.toml` + `src/api/` + `src/auth/` + `src/main.py`。
- `node-app/`：`package.json` + `src/server.js` + `src/lib/helper.js`。
- `go-app/`：`go.mod` + `cmd/server/main.go` + `internal/auth/`。

---

## 8. 沙箱与约束

沿用 `dsh-data-insight` 的约束：

1. `scripts/arch-profile.mjs` 只做纯文件读写与计算，**不 spawn 子进程**。
2. 读写尽量落在工作区；`workdir` 必须指向已存在目录。
3. 不联网；远程 Git URL 不在本阶段支持。
4. 大仓库保护：文件数 >2000 时只扫描前两层模块，不逐文件通读。
5. 安全：不读取 `.env`、密钥文件；如扫描到 `.env` 只记录存在性，不读内容。

---

## 9. 打包与发布步骤（到提交 dsh-index 前停止）

### 9.1 本地实现完成

- [ ] `package.json` / `cordis.patch.yml` / `plugin/index.js` 就绪
- [ ] `skills/arch-doc/SKILL.md` frontmatter 合法
- [ ] `scripts/arch-profile.mjs` 通过 `node --check`
- [ ] `npm test` 全绿
- [ ] `examples/sample-output.json` 与 schema 一致

### 9.2 发布到 GitHub

```powershell
cd D:\Agent预设\UI\arch-doc
git init
git add .
git commit -m "feat: arch-doc DSH skill plugin"
git remote add origin https://github.com/duyanta123/arch-doc.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

### 9.3 本地验证

在目标 profile 的 `package.json`：

```json
{
  "dsh-data-insight": "file:D:/Agent预设/UI/dsh-data-insight",
  "arch-doc": "file:D:/Agent预设/UI/arch-doc"
}
```

`dsh.profile.bundles` 增加 `"arch-doc"`，重启 profile，技能列表应出现 `arch-doc`。

### 9.4 准备 dsh-index 提交物

```text
dsh-index/
└── skills/
    └── arch-doc/
        ├── SKILL.md
        ├── package.json（或 index 元数据）
        ├── README.md
        └── ...
```

**停止点：执行到 `git push` 与本地验证完成即可，不创建 dsh-index PR、不执行 `dsh submit`。**

---

## 10. 提交 dsh-index 前检查清单

- [ ] `package.json` 的 `files` 包含全部发布文件
- [ ] `plugin/index.js` 使用 `FileSystemSkillProvider` 且 `includeDefaultRoots: false`
- [ ] `SKILL.md` frontmatter 有 `name` 和 `description`
- [ ] `scripts/arch-profile.mjs` 零依赖、无子进程
- [ ] `npm test` 通过
- [ ] `node --check` 通过
- [ ] 输入/输出 JSON 结构稳定
- [ ] 有 `examples/` 示例输出
- [ ] 有 `README.md`、`LICENSE`、`PUBLISHING.md`
- [ ] 包名 `arch-doc` 在 npm 上可用
- [ ] 本地 profile 安装后技能可被加载并正确输出文档

---

## 11. 后续扩展（不包含在本阶段）

- 远程 Git URL 输入
- AST 级依赖解析（Tree-sitter）
- 架构漂移检测（文档与代码不一致告警）
- 增量更新架构文档
- PlantUML / Graphviz 输出
- 自定义模板与强制模块边界规则
