# CuRelease

> See you release — 一个面向国内用户的 GitHub Release 查看器。

CuRelease 把指定 GitHub 仓库的 Release 信息渲染成一个静态页面，部署在 **Cloudflare Pages** 上。
**Cloudflare 只负责展示，不代理任何文件下载** —— 下载按钮直接指向 GitHub 官方源链或你配置的国内加速站，
因此不会产生大文件流量成本，免费额度即可长期运行。

## 特性

- 🆓 完全免费运行在 Cloudflare Pages 免费额度上
- 🌐 用户无需访问 GitHub 即可查看 Release 列表
- ⚡ 下载直连 GitHub 源链或国内加速站，不经过 CF
- 🎨 风格照搬 GitHub，支持浅色 / 深色 / 跟随系统主题
- ⚙️ 通过 `config.json` 高度可配置，方便复用
- 🔄 GitHub Actions 自动同步 Release 数据
- 📝 Release 正文支持 Markdown 渲染（GitHub 风格，含表格、代码块、列表等），并做 XSS 防护

## 工作原理

```
                                    ┌─────────────────────────────────────┐
GitHub Actions（每 15 分钟）          │  Cloudflare 构建（仅在数据变化时）    │
                                    │                                     │
  调用 GitHub API                   │   npm run generate                  │
  与 Actions 缓存中的快照对比        │   → CF 服务器现场请求 GitHub API     │
        │                           │   → 生成 public/releases.json       │
        ├─ 无变化 → 结束，不构建     │   → wrangler deploy 部署静态资源     │
        │                           └─────────────────────────────────────┘
        └─ 有变化 → POST Deploy Hook ────────────────┘
                                    │
                                    ▼
                        用户访问页面 → 读取 releases.json
                                    │
                                    ▼
                  点击下载 → 直连 GitHub 官方源链 / 国内加速站
```

要点：

- **GitHub Actions 从不向 main 分支提交文件**，不会与开发者的本地提交产生分叉。
- `releases.json` 只在 Cloudflare 构建时生成，不入库（本地预览用的副本已被 git 忽略）。
- 只有 Release 数据真正变化时才触发 CF 构建，免费构建额度（每月 3,000 分钟）几乎用不完。
- 推送代码到 main 时 Cloudflare 会自动构建一次，同样会现场生成最新数据。

## 快速开始

### 1. Fork 本仓库

### 2. 修改配置文件

编辑根目录的 `config.json`：

```json
{
  "repo": {
    "owner": "你的 GitHub 用户名",
    "name": "你的仓库名"
  },
  "title": "你的页面标题",
  "description": "页面描述",
  "releases": {
    "per_page": 20,
    "include_prerelease": true,
    "include_draft": false,
    "sort": "desc"
  },
  "downloads": {
    "show_official": true,
    "show_download_count": true,
    "mirrors": [
      { "name": "官方 GitHub 源链", "prefix": "" },
      { "name": "加速线路 A", "prefix": "https://你的加速站前缀/" },
      { "name": "加速线路 B", "prefix": "https://你的加速站前缀/" }
    ],
    "default_mirror": "官方 GitHub 源链"
  },
  "ui": {
    "default_theme": "auto",
    "show_release_body": true
  }
}
```

加速站链接的格式为：`加速前缀 + 原始 GitHub 下载链接`。
例如原始链接是 `https://github.com/owner/repo/releases/download/v1.0/app.zip`，
加速前缀是 `https://mirror.example.com/`，最终下载链接就是：
`https://mirror.example.com/https://github.com/owner/repo/releases/download/v1.0/app.zip`。

### 3. 本地测试（可选）

需要 Node.js 18+：

```bash
npm run generate
```

会生成 `public/releases.json`。然后用任意静态服务器托管 `public/` 目录查看效果。

> 如果本机有公司代理导致证书报错，可设置 `NODE_OPTIONS=--use-system-ca` 后再运行。

### 4. 部署到 Cloudflare Workers 并创建 Deploy Hook

仓库根目录已附带 `wrangler.jsonc`（纯静态资源配置），
**用于阻止 Wrangler 把根目录的 `config.json` 误判为 Hugo 站点**。

1. Cloudflare Dashboard → Workers & Pages → Create → Workers → **Deploy with Git**（连接 GitHub 仓库）
2. 构建设置：
   - **Build command**：`npm run generate`（构建时现场请求 GitHub API 生成 `releases.json`）
   - **Deploy command**：`npx wrangler deploy`
3. 保存并部署，之后访问 `https://curelease.<你的子域>.workers.dev`
4. 进入该 Worker → **Settings → Builds & Deployments → Deploy hooks**：
   - 新建一个 Deploy Hook（名称随意，比如 `release-sync`）
   - 复制生成的 URL（形如 `https://api.cloudflare.com/client/v4/accounts/.../deployments`）

> 如果之前已创建过 Worker 且构建日志出现 `npx hugo` 失败，
> 把含 `wrangler.jsonc` 的最新代码 push 到仓库，
> 并在 Worker → Settings → Builds 中把 Build command 改为 `npm run generate` 后重新部署即可。

### 5. 配置 GitHub Actions（定时同步）

1. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret**：
   - 名称：`CF_DEPLOY_HOOK_URL`
   - 值：上一步复制的 Deploy Hook URL
2. 工作流 `.github/workflows/sync-releases.yml` 会：
   - 每 15 分钟请求一次 GitHub API，与缓存快照对比
   - **仅在 Release 数据变化时**通过 Deploy Hook 触发 Cloudflare 重新构建
   - 不向仓库提交任何文件，因此不会干扰你本地的 git 操作
3. 首次可在仓库 **Actions → Sync releases to Cloudflare → Run workflow** 手动触发一次，
   建立数据基线并立即部署

> 使用 Cloudflare Pages 也可以：构建命令填 `npm run generate`，输出目录 `public`，
> 并在 Pages → Settings → Deploy hooks 创建 Hook URL，其余步骤相同。

## 配置项说明

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `repo.owner` | GitHub 仓库所有者 | 必填 |
| `repo.name` | GitHub 仓库名 | 必填 |
| `title` | 页面标题 | 仓库名 |
| `description` | 页面描述 | 空 |
| `releases.per_page` | 获取的 Release 数量（最大 100） | 20 |
| `releases.include_prerelease` | 是否显示预发布版本 | true |
| `releases.include_draft` | 是否显示草稿（公开仓库通常为 false） | false |
| `releases.sort` | 排序方向：`desc` / `asc` | desc |
| `downloads.show_official` | 是否显示"官方源链"按钮 | true |
| `downloads.show_download_count` | 是否显示下载次数 | true |
| `downloads.mirrors` | 镜像线路列表（name + prefix） | 见示例 |
| `downloads.default_mirror` | 默认选中的镜像名称 | 第一个 |
| `ui.default_theme` | 默认主题：`light` / `dark` / `auto` | auto |
| `ui.show_release_body` | 是否显示 Release 正文（changelog） | true |

## 目录结构

```
CuRelease/
├── config.json              # 用户配置（只需改这个）
├── package.json
├── wrangler.jsonc           # Cloudflare Workers 静态资源配置（防框架误判）
├── public/
│   ├── index.html           # 页面入口
│   ├── css/style.css        # GitHub 风格样式
│   ├── js/app.js            # 前端渲染逻辑
│   ├── vendor/              # 本地 vendored 依赖（marked + DOMPurify，无需联网 CDN）
│   └── releases.json        # 构建时自动生成（不入仓库，已 gitignore）
├── scripts/
│   ├── generate.js          # CF 构建/本地预览时生成 releases.json
│   ├── sync-check.js        # GitHub Actions 定时检查数据是否变化
│   └── lib/releases.js      # 共享的 GitHub API 与数据处理逻辑
└── .github/workflows/
    └── sync-releases.yml    # 定时对比快照，变化时才触发 CF Deploy Hook
```

## 注意事项

- 本项目仅针对**公开仓库**设计。私有仓库需要额外的 Token 处理，不建议将带 Token 的链接交给第三方加速站。
- 国内加速站稳定性参差不齐，建议配置多条线路，并始终保留官方源链作为兜底。
- 对于重要的构建产物，建议在 Release 中附带 SHA256 校验文件，供用户校验。

## License

MIT
