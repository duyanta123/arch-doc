# 发布与分发指南（PUBLISHING）

本文档记录 `arch-doc` 从源码到分发的完整步骤，供维护者执行。

## 当前状态

- 包结构已建成（package.json / cordis.patch.yml / plugin/index.js / skills / docs / scripts / examples / test）。
- `scripts/arch-profile.mjs` 通过 `node --check`，零依赖、无子进程。
- `npm test`（node --test）全绿，覆盖 probe / scan / deps / entry / run-methods / output-json / skip-excluded。
- 源码已推送 GitHub（`main` 分支），npm 包名为 `dsh-arch-doc`（原名 `arch-doc` 触发 npm 防抢注拦截——与既有包 `archdoc` 去连字符后撞名；插件 id 与 GitHub 仓库名保持 `arch-doc` 不变）。

## 前置条件

- 能访问 github.com 与 registry.npmjs.org 的终端（或在代理环境下执行 git push）。
- 已登录 npm：`npm login`（需要 npm 账号 + 2FA）。
- GitHub 账号（用于建仓库与 push）。

## 步骤 1：发布到 GitHub

```powershell
# 1) 浏览器打开 https://github.com/new，仓库名 arch-doc，公开，
#    不要勾选 "Initialize with README / .gitignore / license"（本地已有）。
cd <你的本地路径>/arch-doc
git remote add origin https://github.com/duyanta123/arch-doc.git
git push -u origin main
git tag v<version>
git push origin v<version>
```

## 步骤 2：发布到 npm

```powershell
cd <你的本地路径>/arch-doc
npm view dsh-arch-doc version   # 确认包名可用（应 404）
npm login
npm publish
```

## 步骤 3：安装到 profile（三选一）

```powershell
# npm 形态
dsh plugin --profile web add dsh-arch-doc

# GitHub 形态
dsh plugin --profile web add github:duyanta123/arch-doc#v<version>

# 本地 file: 链接（无需发布）
# profile 的 package.json 加 "arch-doc": "file:<本地路径>/arch-doc"，
# 并在 dsh.profile.bundles 数组加 "arch-doc"，然后 pnpm install。
```

## 步骤 4：验证

1. 重启 profile，技能列表应出现 `arch-doc`。
2. 说「用 arch-doc 分析 test/fixtures/python-app」，确认五阶段执行并产出 ARCHITECTURE.md / architecture.json / Mermaid 图。

## 步骤 5：提交 dsh-index

在 dsh-index 仓库的 `skills/` 下新增 `arch-doc/` 目录，包含技能索引所需的最小集合：

```text
dsh-index/
└── skills/
    └── arch-doc/
        ├── SKILL.md            # 技能定义（frontmatter 含 name / description）
        ├── package.json        # 包元数据（或 dsh-index 约定的 index 元数据）
        ├── README.md           # 能力说明
        └── ...
```

提交方式二选一：

- `dsh submit`（如本机已安装 dsh CLI）。
- 在 dsh-index 仓库发起 PR，按其 CONTRIBUTING 约定填写技能元数据。

## 提交 dsh-index 前检查清单

- [x] `package.json` 的 `files` 包含全部发布文件
- [x] `plugin/index.js` 使用 `FileSystemSkillProvider` 且 `includeDefaultRoots: false`
- [x] `SKILL.md` frontmatter 有 `name` 和 `description`
- [x] `scripts/arch-profile.mjs` 零依赖、无子进程
- [x] `npm test` 通过
- [x] `node --check` 通过
- [x] 输入/输出 JSON 结构稳定
- [x] 有 `examples/` 示例输出
- [x] 有 `README.md`、`LICENSE`、`PUBLISHING.md`
- [x] 包名 `dsh-arch-doc` 在 npm 上可用（`arch-doc` 因与既有包 `archdoc` 撞名被防抢注拦截，2026-09-02 改名）
- [ ] 本地 profile 安装后技能可被加载并正确输出文档
- [ ] dsh-index PR 已提交

## 本地开发循环（改技能内容后）

1. 改 `skills/`、`docs/`、`scripts/` 下的文件。
2. 本地 `file:` 链接形态下，改 `skills/` 无需重装（FileSystemSkillProvider 会 watch 技能根）。
3. 改 `plugin/index.js` / `cordis.patch.yml` / `package.json` 后需 `pnpm install` 并重启 profile。
4. 提交前：`node --check scripts/arch-profile.mjs`、`npm test`、`git status` 确认。
5. 版本变更时：更新 `package.json` 的 `version` 与 `CHANGELOG.md`，打 tag 并推送。
