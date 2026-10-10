import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  OUTPUT_PATH,
  loadConfig,
  buildPayload,
} from "./lib/releases.js";

/**
 * CuRelease build step.
 *
 * 在 Cloudflare 构建时运行（也可在本地运行）：
 * 读取 config.json -> 请求 GitHub API -> 写出 public/releases.json
 */
async function main() {
  console.log("[CuRelease] 读取 config.json ...");
  const config = loadConfig();
  console.log(`[CuRelease] 目标仓库：${config.repo.owner}/${config.repo.name}`);

  console.log("[CuRelease] 请求 GitHub API ...");
  const payload = await buildPayload(config);
  console.log(`[CuRelease] 共保留 ${payload.releases.length} 个 Release`);

  const output = {
    generated_at: new Date().toISOString(),
    ...payload,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`[CuRelease] 已写入 ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("[CuRelease] 生成失败：", err.message);
  process.exit(1);
});
