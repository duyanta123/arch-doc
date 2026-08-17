# Examples

| 文件 | 用途 |
|------|------|
| `input.json` | 调用参数样例：`repo_path` / `output_path` / `max_depth` / `exclude_dirs` / `generate_mermaid` |
| `sample-output.md` | 生成的架构文档样例（Markdown 通道） |
| `sample-output.json` | 生成的结构化结果样例（JSON 通道：模块 / 依赖 / 入口 / 运行方式） |

`test/fixtures/` 下另有 Python / Node / Go 三个最小应用，供 `node --test` 契约测试使用：`go-app`（`cmd/server` 布局）、`node-app`（`src/server.js` + ESM）、`python-app`（`src/` 包结构 + `pyproject.toml`）。
