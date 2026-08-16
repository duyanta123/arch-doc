# arch-doc 扫描与识别规则

本文档固化 `scripts/arch-profile.mjs` 的确定性规则，保证不同运行环境产出一致的事实数据。
「硬事实」由脚本产出，「语义总结」由 LLM 补充，两者不得互相替代。

## 1. 语言探测（--probe）

按文件优先级识别，先到先得：

| 语言 | 标识文件 |
|---|---|
| TypeScript | tsconfig.json / pnpm-workspace.yaml（优先于 JavaScript 判定） |
| Python | pyproject.toml / setup.py / setup.cfg / requirements.txt / Pipfile |
| JavaScript | package.json |
| Go | go.mod |
| Java | pom.xml / build.gradle / build.gradle.kts / settings.gradle |
| Kotlin | build.gradle.kts |
| Rust | Cargo.toml |
| C / C++ | CMakeLists.txt / Makefile / meson.build |
| Ruby | Gemfile / Rakefile |
| PHP | composer.json |

无标识文件时用目录结构启发式：存在 `cmd/`、`internal/`、`pkg/` 判为 Go；
存在 `src/`、`app/`、`lib/` 时按 `*.py` 与 `*.js/*.ts` 数量比较判为 Python / TypeScript；
否则回退 `generic`。

## 2. 仓库类型判定（repo_type）

| 类型 | 规则 |
|---|---|
| monorepo | 顶层存在 packages/、apps/、services/、microservices/ |
| microservices | 多个顶层子目录各自含 Dockerfile / main.go / main.py / package.json / go.mod |
| library | 顶层含 src/、lib/ 或 include/ 且无运行入口 |
| monolith | 其余情况 |

「运行入口」轻量判定：存在 main.* / server.* / app.* / worker.* / cli.* / index.*，或 bin/、cmd/ 目录，或 Dockerfile。

## 3. 目录扫描

- 排除目录（默认）：.git、node_modules、dist、build、__pycache__、.venv、venv、target、.idea、.vscode、.pytest_cache、.mypy_cache、coverage。
- 深度：`--max-depth` 默认 3（1–10）。
- 文件白名单：源码、配置、Manifest、README（按扩展名 + Makefile/Dockerfile/Rakefile/Gemfile 特殊名）。
- 大仓库保护：文件数 >2000 时只扫前两层模块，不逐文件通读内容。

## 4. 模块划分（--scan）

按语言惯例取模块容器目录，其直接子目录（含源码）成为模块；容器自身若无子目录而直接含源码，则容器本身为模块：

| 语言 | 模块容器 |
|---|---|
| Python | src/、app/、lib/，及顶层含 __init__.py 的包目录 |
| JavaScript / TypeScript | src/、lib/、packages/、apps/ |
| Go | cmd/、internal/、pkg/ |
| Java / Kotlin | src/main/java/（取包名首层目录） |
| 通用 | src/、lib/、app/、packages/ |

每模块输出：name、path（posix 相对路径）、language、key_files（最多 5 个，优先 README/入口/大文件）、file_count。

## 5. 依赖提取（--deps）

静态文本解析，不做 AST。

| 语言 | 规则 |
|---|---|
| Python | `from X import ...`、`import X`（X 取首个标识段） |
| JavaScript / TypeScript | `import ... from 'X'`、`import 'X'`、`require('X')`、`import('X')` |
| Go | 单行 `import "X"` 与 `import (...)` 块 |
| Java / Kotlin | `import X;`（含 static） |

内部依赖判定：导入路径首段命中模块名，或导入路径命中模块路径（点号归一后前缀匹配 / Go 模块路径包含匹配）。
未命中内部模块的导入归入外部依赖，并从 Manifest（package.json / pyproject.toml / go.mod / pom.xml）补版本号。

动态导入（`importlib`、`__import__`、`require(变量)`）不硬猜，只记录为风险。

## 6. 入口点判定（--entry）

| 类型 | 判定依据 |
|---|---|
| web | 内容含 uvicorn/fastapi/flask/django/express/app.listen/listen(http) 等；或 server.js/app.js/index.js/main.go/Application.java |
| cli | bin/、cmd/ 目录；或 cli.py/cli.js；或内容含 argparse/commander/cobra/click/yargs/process.argv |
| worker | 文件名/内容含 worker、consumer、queue、celery、bullmq |
| scheduler | 文件名/内容含 cron、scheduler、schedule |
| library | 无运行入口，存在 lib.rs / index.ts 导出 / setup.py 包名 |
| unknown | 无法判断时不强行分类 |

## 7. 运行方式提取（--entry）

| 来源 | 提取 |
|---|---|
| package.json scripts | install/dev/build/test/start/deploy 等（npm install / npm run <name> / npm start） |
| pyproject.toml | [project.scripts] 控制台命令、pip install -e .、uvicorn 开发命令 |
| Makefile | 目标名与 make <target> |
| Dockerfile | docker build / docker run |
| docker-compose.yml | docker compose up / down |
| README.md | npm run / pip install / go build / mvn 等命令仅作候选，需标注来源 |
