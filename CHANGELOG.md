# Changelog

## Unreleased

## 0.1.3 (2026-09-06)

- 增加固定 `@deepseek-ai/dsh@0.1.2-rc.1` 的 `npm run test:compat` 门禁及 Windows/Ubuntu Node 22.19 CI，隔离执行本地 bundle add、配置 dump 和有限时长启动。
- 文档明确独立脚本支持 Node >=18，最新 DSH 宿主要求 Node >=22.19；安装示例更新为 `v0.1.3`。
- 修复 `cordis.patch.yml` 的加载包名为 `dsh-arch-doc`，同时保持插件 id `arch-doc` 不变，避免 DSH 启动时报 `ERR_MODULE_NOT_FOUND`。
- npm 包名改为 `dsh-arch-doc`：`arch-doc` 触发 npm 防抢注拦截（与既有包 `archdoc` 去连字符后撞名，403）。插件 id（cordis.patch.yml / providerName）与 GitHub 仓库名保持 `arch-doc` 不变，仅 npm 分发名变更。
- 新增 `prepublishOnly` 钩子：npm 发布前自动运行测试门禁，防止红测试状态发包。

## 0.1.2 (2026-09-02)

- `.gitignore` 补充 `.tmp/` 本地临时产物与 `.env` 类密钥忽略。
- `package.json` 补充 `repository` / `bugs` / `homepage` 元数据。
- 新增 GitHub Actions CI（`.github/workflows/ci.yml`）：ubuntu + windows × Node 18/22 矩阵运行语法检查与契约测试。
- 新增 `.editorconfig`（UTF-8 / LF / 2 空格基线）。
- README 新增「排障」章节：Mermaid 本地渲染、大仓库深度控制、无 Node 降级、入口识别。
- 新增 `examples/README.md` 与 fixtures 说明。

## 0.1.1 (2026-08-16)

- 文档清理：移除内部实现方案稿（arch-doc-实现文档.md），公开文档不再包含本地个人路径。
- `PUBLISHING.md` 重写：状态更新为「已推送 GitHub、npm 包名可用」，补充 dsh-index 提交步骤与版本变更流程，检查清单勾选已达成项。
- `README.md` 补充输出产物说明、环境要求与 License。
- 修复 `test/arch-profile.test.mjs` 字符串字面量跨行导致的语法错误，`npm test` 11 项全部通过。

## 0.1.0 (2026-08-16)

- 首个版本：实现 `arch-profile.mjs` 的 probe / scan / deps / entry / all 五类确定性扫描。
- 提供 `skills/arch-doc/SKILL.md` runbook 与 `docs/architecture-template.md` 输出模板。
- 内置 Python / Node / Go 三个最小 fixture 与 `node --test` 契约测试。
- 按 `dsh-data-insight` 同一标准打包（`package.json` + `cordis.patch.yml` + `plugin/index.js`）。
