# arch-doc

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

1. 安装：`dsh plugin --profile web add github:duyanta123/arch-doc#v0.1.0`
2. 使用：对 Agent 说「用 arch-doc 分析 /path/to/repo」
3. 本地开发：profile 的 package.json 加 `"arch-doc": "file:D:/.../arch-doc"`，bundles 加 `"arch-doc"`

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
