# arch-doc

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c1d95)](https://github.com/topics/dsh-plugin)
[![dsh-index](https://img.shields.io/badge/dsh--index-arch--doc-blue)](https://dsh-index.xlings.org/packages/arch-doc/)
[![version](https://img.shields.io/badge/version-0.1.1-green)](CHANGELOG.md)

DSH 技能插件：输入代码库路径，自动生成架构文档（模块职责、依赖关系、入口点、运行方式）。

## 能力
- 项目类型 / 语言 / 构建系统识别
- 模块划分与职责总结
- 内部 / 外部依赖提取与 Mermaid 依赖图
- 入口点（CLI / Web / Worker / Scheduler / Library）识别
- 运行方式（安装 / 开发 / 构建 / 测试 / 运行 / 部署）提取
- 输出 Markdown + JSON

## 目录结构

```text
arch-doc/
├── package.json                  # npm 包 + dsh.bundle.patch
├── cordis.patch.yml              # DSH bundle patch
├── plugin/index.js               # ESM 入口，注册 skills/ 为技能根
├── skills/arch-doc/SKILL.md      # 技能 frontmatter + 阶段执行 runbook
├── docs/                         # 输出模板 + 扫描规则
├── scripts/arch-profile.mjs      # 零依赖 Node 脚本：probe/scan/deps/entry
├── examples/                     # 输入/输出示例
└── test/                         # node --test 测试 + fixtures
```

## 使用

1. 安装：`dsh plugin --profile web add github:duyanta123/arch-doc#v0.1.1`
2. 使用：对 Agent 说「用 arch-doc 分析 /path/to/repo」
3. 本地开发：profile 的 package.json 加 `"arch-doc": "file:<本地路径>/arch-doc"`，bundles 加 `"arch-doc"`

## 输出

- `docs/ARCHITECTURE.md`：结构化架构文档（按 `docs/architecture-template.md` 骨架）
- `docs/architecture.json`：机器可读的结构化结果
- `docs/diagrams/module-dependencies.mmd`：Mermaid 模块依赖图

## 环境要求

- Node.js >= 18（运行 `scripts/arch-profile.mjs`；无 Node 时 runbook 自动降级为 shell 手工探测）

## 脚本

```bash
node scripts/arch-profile.mjs <repo_path> --probe
node scripts/arch-profile.mjs <repo_path> --scan --max-depth 3
node scripts/arch-profile.mjs <repo_path> --deps
node scripts/arch-profile.mjs <repo_path> --entry
node scripts/arch-profile.mjs <repo_path> --all
```

## 测试

```bash
npm test
node --check scripts/arch-profile.mjs
```

## 排障

- **生成的 `ARCHITECTURE.md` 里 Mermaid 图不渲染**：`file://` 协议下浏览器直接打开时，CDN 加载的 mermaid.js 受同源策略限制无法自动渲染；用 Typora 等本地渲染编辑器打开，或把 `diagrams/module-dependencies.mmd` 内容粘到 mermaid.live 查看。`.mmd` 源文件语法本身独立有效。
- **大仓库扫描太慢 / 输出太长**：`--max-depth 3` 起步，必要时降到 2；确认 `exclude_dirs` 覆盖了 `node_modules`、`.venv`、构建产物等大目录。
- **无 Node 环境时**：runbook 自动降级为 shell 手工探测（`find` / `ls` / 读 `package.json` / `go.mod` / `pyproject.toml`），结论质量略降但流程完整。
- **识别不到入口点**：先跑 `--probe` 确认项目类型识别正确；混合技术栈仓库以主语言构建文件为准（如 Go+Node 混合，以 `go.mod` 优先）。

## License

[MIT](./LICENSE)
