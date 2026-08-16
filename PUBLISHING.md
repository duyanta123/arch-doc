# 发布与分发指南（PUBLISHING）

本文档记录 `arch-doc` 从源码到分发的完整步骤，供维护者在有网终端执行。
**本阶段截止到「准备提交 dsh-index」为止，不执行 dsh-index PR 提交、不执行 `dsh submit`。**

## 当前状态（构建侧已就绪）

- 包结构已建成（package.json / cordis.patch.yml / plugin/index.js / skills / docs / scripts / examples / test）。
- `scripts/arch-profile.mjs` 通过 `node --check`，零依赖、无子进程。
- `npm test`（node --test）全绿，覆盖 probe / scan / deps / entry / run-methods / output-json / skip-excluded。
- 已 `git init` + 本地初始 commit（`main` 分支），未 push、未发布 npm。
- 未执行的网络步骤：GitHub 建仓与 push、npm publish、dsh-index PR。

## 前置条件

- 一个有网、能访问 github.com 与 registry.npmjs.org 的终端。
- 已登录 npm：`npm login`（需要 npm 账号 + 2FA）。
- GitHub 账号（用于建仓库与 push）。

## 步骤 1：发布到 GitHub

```powershell
# 1) 浏览器打开 https://github.com/new，仓库名 arch-doc，公开，
#    不要勾选 "Initialize with README / .gitignore / license"（本地已有）。
cd D:\Agent预设\UI\arch-doc
git remote add origin https://github.com/duyanta123/arch-doc.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

## 步骤 2：发布到 npm

```powershell
cd D:\Agent预设\UI\arch-doc
npm view arch-doc version   # 确认包名可用（应 404）
npm login
npm publish --access public
```

## 步骤 3：安装到 profile（三选一）

```powershell
# npm 形态
dsh plugin --profile web add arch-doc

# GitHub 形态
dsh plugin --profile web add github:duyanta123/arch-doc#v0.1.0

# 本地 file: 链接（无需发布）
# profile 的 package.json 加 "arch-doc": "file:D:/Agent预设/UI/arch-doc"，
# 并在 dsh.profile.bundles 数组加 "arch-doc"，然后 pnpm install。
```

## 步骤 4：验证

1. 重启 profile，技能列表应出现 `arch-doc`。
2. 说「用 arch-doc 分析 test/fixtures/python-app」，确认五阶段执行并产出 ARCHITECTURE.md / architecture.json / Mermaid 图。

## 步骤 5：准备 dsh-index 提交物（停下点）

```text
dsh-index/
└── skills/
    └── arch-doc/
        ├── SKILL.md
        ├── package.json（或 index 元数据）
        ├── README.md
        └── ...
```

**停止点：执行到步骤 1（push）与步骤 4（本地验证）完成即可，不创建 dsh-index PR、不执行 `dsh submit`。检查清单全过后等待下一步指令。**

## 提交 dsh-index 前检查清单

- [ ] `package.json` 的 `files` 包含全部发布文件
- [ ] `plugin/index.js` 使用 `FileSystemSkillProvider` 且 `includeDefaultRoots: false`
- [ ] `SKILL.md` frontmatter 有 `name` 和 `description`
- [ ] `scripts/arch-profile.mjs` 零依赖、无子进程
- [ ] `npm test` 通过
- [ ] `node --check` 通过
- [ ] 输入/输出 JSON 结构稳定
- [ ] 有 `examples/` 示例输出
- [ ] 有 `README.md`、`LICENSE`、`PUBLISHING.md`
- [ ] 包名 `arch-doc` 在 npm 上可用（需联网确认）
- [ ] 本地 profile 安装后技能可被加载并正确输出文档

## 本地开发循环（改技能内容后）

1. 改 `skills/`、`docs/`、`scripts/` 下的文件。
2. 本地 `file:` 链接形态下，改 `skills/` 无需重装（FileSystemSkillProvider 会 watch 技能根）。
3. 改 `plugin/index.js` / `cordis.patch.yml` / `package.json` 后需 `pnpm install` 并重启 profile。
4. 提交前：`node --check scripts/arch-profile.mjs`、`npm test`、`git status` 确认。
