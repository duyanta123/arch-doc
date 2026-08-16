/**
 * arch-doc — DSH (DeepSeek Harness) 插件入口。
 *
 * 复用官方 @deepseek-ai/dsh-skill-filesystem 提供者，把本包自带的 skills/
 * 目录注册为技能根（includeDefaultRoots: false，避免与宿主 profile 的
 * 技能根重复）。零构建：本 ESM 模块由 harness 直接加载。
 *
 * 本包为纯指令型技能插件：它只注入 runbook 指令，计算由宿主已提供的
 * 文件 / shell 工具驱动的 LLM 完成；arch-profile.mjs 脚本由 runbook 指引
 * 通过 shell 直接调用（Node 内建能力，零依赖，不 spawn 子进程）。
 */
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
