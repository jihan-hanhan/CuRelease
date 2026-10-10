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
config.json (指定 owner/repo 等)
       ↓
GitHub Actions 定时调用 GitHub API
       ↓ 生成 public/releases.json 并提交回仓库
Cloudflare Pages 自动构建部署
       ↓
用户访问页面 → 读取 releases.json → 展示 Release 与文件
       ↓
点击下载 → 直连 GitHub 官方源链 / 国内加速站
```

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

### 4. 启用 GitHub Actions

仓库的 `.github/workflows/generate.yml` 会在以下情况自动生成 `releases.json`：

- 每 15 分钟（定时同步）
- 推送到 `main` / `master` 分支且改动了配置或脚本
- 手动触发（Actions 页面点击 Run workflow）

首次使用请在 GitHub 仓库 **Settings → Actions → General** 中确认 Workflow 权限为
"Read and write permissions"，以便 Action 能提交 `releases.json`。

### 5. 部署到 Cloudflare Pages

1. 登录 Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
2. 选择你的仓库
3. 构建设置：
   - **Framework preset**: None
   - **Build command**: 留空
   - **Build output directory**: `public`
4. 保存并部署

部署后，每次仓库有新提交（包括 Actions 自动更新 `releases.json`），CF Pages 都会自动重新构建。

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
├── public/
│   ├── index.html           # 页面入口
│   ├── css/style.css        # GitHub 风格样式
│   ├── js/app.js            # 前端渲染逻辑
│   ├── vendor/              # 本地 vendored 依赖（marked + DOMPurify，无需联网 CDN）
│   └── releases.json        # 由脚本/Action 生成
├── scripts/
│   └── generate.js          # 读取 config 并生成 releases.json
└── .github/workflows/
    └── generate.yml         # 定时生成 releases.json
```

## 注意事项

- 本项目仅针对**公开仓库**设计。私有仓库需要额外的 Token 处理，不建议将带 Token 的链接交给第三方加速站。
- 国内加速站稳定性参差不齐，建议配置多条线路，并始终保留官方源链作为兜底。
- 对于重要的构建产物，建议在 Release 中附带 SHA256 校验文件，供用户校验。

## License

MIT
