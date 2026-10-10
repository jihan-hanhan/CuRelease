import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  ROOT,
  loadConfig,
  buildPayload,
} from "./lib/releases.js";

/**
 * 定时同步检查（由 GitHub Actions 调用）。
 *
 * 拉取当前 Release 数据，与 Actions 缓存里的上次快照对比：
 * - 没变化：输出 changed=false，workflow 跳过部署，不消耗 CF 构建额度
 * - 有变化：更新缓存快照，输出 changed=true，workflow 调用 CF Deploy Hook
 *
 * 该脚本不向仓库提交任何文件，因此不会与开发者本地分支产生分叉。
 */

const CACHE_FILE = process.env.CURELEASE_CACHE_FILE ||
  `${ROOT}/.cache/releases.json`;

function setOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    writeFileSync(file, `${key}=${value}\n`, { flag: "a" });
  }
  console.log(`[CuRelease] ${key}=${value}`);
}

async function main() {
  const config = loadConfig();
  console.log(
    `[CuRelease] 检查 ${config.repo.owner}/${config.repo.name} 的 Release 变化 ...`
  );

  const payload = await buildPayload(config);
  const current = JSON.stringify(payload);

  let previous = null;
  if (existsSync(CACHE_FILE)) {
    previous = readFileSync(CACHE_FILE, "utf-8");
  }

  const changed = previous !== current;

  if (!changed) {
    console.log("[CuRelease] Release 数据无变化，跳过 Cloudflare 部署。");
    setOutput("changed", "false");
    return;
  }

  if (previous === null) {
    console.log("[CuRelease] 首次运行，写入基线快照。");
  } else {
    console.log("[CuRelease] 检测到 Release 数据变化，将触发 Cloudflare 部署。");
  }

  // 把最新快照写回缓存路径，交由 actions/cache 保存
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, current, "utf-8");

  setOutput("changed", "true");
}

main().catch((err) => {
  console.error("[CuRelease] 同步检查失败：", err.message);
  process.exit(1);
});
