# arch-doc 维护规则（Maintenance Runbook）

> 本文档是 arch-doc 仓库的专属维护基准，与顶层 [PLUGIN-MAINTENANCE.md](../../docs/PLUGIN-MAINTENANCE.md) 通用规则配套使用。本文件聚焦本仓库的细节。
> 原则：**不改不动，要改就一步到位**——代码/技能、测试、CHANGELOG、版本号、tag 一起改，不留下半成品版本。

## 1. 仓库概况

| 项 | 值 |
|---|---|
| 类型 | 分析型（代码库 → 架构文档） |
| 当前版本 | 0.1.2 |
| 分发状态 | dsh-index / awesome-dsh-plugin / awesome-deepseek-harness 已收录 |
| 运行时 | 零构建 ESM，`plugin/index.js` 由 harness 加载 |
| 核心脚本 | `scripts/arch-profile.mjs`（probe / scan / deps / entry / all） |

## 2. 目录结构与职责

```text
arch-doc/
├── package.json            # npm 包 + dsh.bundle.patch + files 白名单
├── cordis.patch.yml        # DSH bundle patch
├── plugin/index.js         # 注册 skills/ 为技能根（FileSystemSkillProvider）
├── skills/arch-doc/SKILL.md       # 五阶段 runbook
├── scripts/arch-profile.mjs       # 零依赖扫描器（正确性核心）
├── docs/                           # 输出模板 + 扫描规则说明
├── examples/                       # 输入/输出示例
├── test/arch-profile.test.mjs      # node --test 契约测试（当前 11 例）
├── test/dsh-compat.test.mjs        # DSH 0.1.2-rc.1 宿主兼容性门禁
└── test/fixtures/{python-app,node-app,go-app}/   # 三语言 fixture
```

## 3. CI 与测试门禁

- **独立脚本回归**：`npm test`（=`node --test test/arch-profile.test.mjs`），当前 **11 例**；Node 18/22 矩阵验证脚本，不代表最新 DSH 宿主兼容性。
- **DSH 宿主兼容**：`npm run test:compat` 固定 `@deepseek-ai/dsh@0.1.2-rc.1`，要求 Node >=22.12，执行临时 profile 的 add、dump-config 和有限时长启动。
- **GitHub Actions**：`.github/workflows/ci.yml` 保留 ubuntu + windows × Node 18/22 回归，并增加 Node 22.12 compat job。
- CI 覆盖语言：Python、Node、Go。**新增语言时必须补该语言的 fixture 和契约用例**。

## 4. 一次完整变更的动作序列

1. 改代码 / 技能 / 文档
2. 补或更新 `test/arch-profile.test.mjs` 与对应 fixture
3. 更新 `CHANGELOG.md`（先写 `Unreleased`）
4. 本地跑 `npm test` 全绿
5. 有行为变更时改 `package.json` 的 `version`（semver）
6. 推送 `main`，GitHub Actions 全绿
7. 打 tag `v0.x.y` 并推送

## 5. 分场景维护细则

### 5.1 扫描器逻辑变更（`arch-profile.mjs`）
- **高风险区**：语言探测、模块划分、依赖提取、入口点分类、运行方式提取。
- 每次改动必须为受影响语言更新/新增 fixture，并加至少一个契约用例断言输出结构。
- 行为不兼容（如输出 JSON 结构变化）→ 升 **major**（当前在 0.x 阶段，用 minor 替代）。

### 5.2 新增语言支持
- 需同步：`LANG_MARKERS` / `isStdlib` / `extractImports` / `isSourceCode` 的分支；必要时 `classifyEntry` / `scanModules`。
- 必须新增 `test/fixtures/<lang>-app/` 最小可运行 fixture，并覆盖：probe、scan、deps、entry 四类断言。

### 5.3 runbook / 模板调整
- `skills/arch-doc/SKILL.md` 阶段硬门槛变更，或 `docs/architecture-template.md` 章节调整：确保与扫描器实际输出一致，避免 runbook 引用不存在的字段。

### 5.4 元数据与打包
- 改动对外描述时同步：`README.md` 首段、`package.json` 的 `description`/`keywords`、awesome-dsh-plugin 的 `data/plugins/duyanta123__arch-doc.yml`。
- `files` 白名单已含 `plugin/`、`cordis.patch.yml`、`skills/`、`docs/`、`scripts/`、`examples/`、`README.md`、`CHANGELOG.md`、`PUBLISHING.md`、`LICENSE`——新增顶层资产时记得核对。

## 6. 版本与发布节奏

- 多数改动为 **patch/minor**；扫描器行为不兼容时升 major。
- 发布动作：归并 `Unreleased` → 明确版本号 → 确认 `version` 与 tag 一致 → 打 `v0.x.y`。

## 7. 发布前清单

- [ ] `npm test` 全绿（11 例）
- [ ] `npm run test:compat` 通过（DSH 0.1.2-rc.1 / Node 22.12+）
- [ ] 新增语言/能力时 fixture 与用例齐全
- [ ] `CHANGELOG.md` 已归并 `Unreleased`
- [ ] `package.json` `version` 与 tag 一致
- [ ] `files` 字段包含所有应发布文件
- [ ] 对外描述若变，列表条目已同步（或已提交 PR）
- [ ] 推送 `main`，GitHub Actions 全绿
- [ ] 打并推送 tag `v0.x.y`
