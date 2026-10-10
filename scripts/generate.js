import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "config.json");
const OUTPUT_PATH = resolve(ROOT, "public", "releases.json");

/**
 * Load and validate config.json
 */
function loadConfig() {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw);

  if (!config.repo?.owner || !config.repo?.name) {
    throw new Error("config.json 中缺少 repo.owner 或 repo.name");
  }

  return config;
}

/**
 * Format a single asset to the shape the frontend expects.
 */
function mapAsset(asset) {
  return {
    id: asset.id,
    name: asset.name,
    size: asset.size,
    download_count: asset.download_count ?? 0,
    content_type: asset.content_type ?? "",
    browser_download_url: asset.browser_download_url,
  };
}

/**
 * Format a single release.
 */
function mapRelease(release) {
  return {
    id: release.id,
    tag_name: release.tag_name,
    name: release.name || release.tag_name,
    body: release.body || "",
    published_at: release.published_at,
    prerelease: release.prerelease,
    draft: release.draft,
    html_url: release.html_url,
    author: {
      login: release.author?.login,
      avatar_url: release.author?.avatar_url,
    },
    assets: (release.assets || []).map(mapAsset),
  };
}

/**
 * Fetch releases from the GitHub API.
 * Supports optional GITHUB_TOKEN env var for higher rate limits.
 */
async function fetchReleases(config) {
  const { owner, name } = config.repo;
  const perPage = Math.min(config.releases?.per_page ?? 20, 100);
  const token = process.env.GITHUB_TOKEN;

  const url = `https://api.github.com/repos/${owner}/${name}/releases?per_page=${perPage}`;

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CuRelease",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GitHub API 请求失败：${res.status} ${res.statusText}\n${text}`
    );
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Filter releases according to config.
 */
function filterReleases(releases, config) {
  const includePrerelease = config.releases?.include_prerelease !== false;
  const includeDraft = config.releases?.include_draft === true;

  return releases.filter((r) => {
    if (r.draft && !includeDraft) return false;
    if (r.prerelease && !includePrerelease) return false;
    return true;
  });
}

/**
 * Sort releases according to config (default: desc by publish time).
 */
function sortReleases(releases, config) {
  const sort = config.releases?.sort ?? "desc";

  const sorted = [...releases].sort((a, b) => {
    const ta = new Date(a.published_at || 0).getTime();
    const tb = new Date(b.published_at || 0).getTime();
    return sort === "asc" ? ta - tb : tb - ta;
  });

  return sorted;
}

/**
 * Pick only the config fields the frontend needs to render the page.
 */
function buildPublicConfig(config) {
  return {
    repo: {
      owner: config.repo.owner,
      name: config.repo.name,
    },
    title: config.title || config.repo.name,
    description: config.description || "",
    releases: {
      per_page: config.releases?.per_page ?? 20,
      include_prerelease: config.releases?.include_prerelease !== false,
    },
    downloads: {
      show_official: config.downloads?.show_official !== false,
      show_download_count: config.downloads?.show_download_count !== false,
      mirrors: config.downloads?.mirrors ?? [],
      default_mirror: config.downloads?.default_mirror || "",
    },
    ui: {
      default_theme: config.ui?.default_theme || "auto",
      show_release_body: config.ui?.show_release_body !== false,
    },
  };
}

async function main() {
  console.log("[CuRelease] 读取 config.json ...");
  const config = loadConfig();
  console.log(`[CuRelease] 目标仓库：${config.repo.owner}/${config.repo.name}`);

  console.log("[CuRelease] 请求 GitHub API ...");
  const rawReleases = await fetchReleases(config);
  console.log(`[CuRelease] 共获取 ${rawReleases.length} 个 Release`);

  const filtered = filterReleases(rawReleases, config);
  const sorted = sortReleases(filtered, config);
  const releases = sorted.map(mapRelease);
  console.log(`[CuRelease] 过滤后保留 ${releases.length} 个 Release`);

  const output = {
    generated_at: new Date().toISOString(),
    config: buildPublicConfig(config),
    releases,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`[CuRelease] 已写入 ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("[CuRelease] 生成失败：", err.message);
  process.exit(1);
});
