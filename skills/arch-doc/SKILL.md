---
name: arch-doc
description: 架构文档生成：输入一个代码库路径，自动分析模块职责、依赖关系、入口点与运行方式，输出结构化 Markdown 架构文档与 JSON。需要读懂项目结构、生成架构文档、梳理模块依赖、整理启动/构建/测试命令时加载本技能。
---

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
