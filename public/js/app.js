/* ===== CuRelease frontend ===== */

(function () {
  "use strict";

  const STORAGE_KEY = "curelease.mirror";
  const THEME_KEY = "curelease.theme";

  let data = null; // the loaded releases.json payload
  let currentMirrorPrefix = "";

  /* ---------- markdown ---------- */

  function setupMarkdown() {
    if (window.DOMPurify) {
      window.DOMPurify.addHook("afterSanitizeAttributes", function (node) {
        if (node.tagName === "A") {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      });
    }
  }

  function renderMarkdown(text) {
    if (!text) return "";
    if (window.marked && window.DOMPurify) {
      const html = window.marked.parse(text, {
        gfm: true,
        breaks: true,
      });
      return window.DOMPurify.sanitize(html);
    }
    // fallback: plain text with line breaks
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  /* ---------- utils ---------- */

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes == null) return "";
    if (bytes >= 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat("en-US").format(n);
  }

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
  }

  function setupTheme(configTheme) {
    const saved = localStorage.getItem(THEME_KEY);
    const initial = saved || configTheme || "auto";
    applyTheme(initial);

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") || "auto";
      const next = current === "light" ? "dark" : current === "dark" ? "auto" : "light";
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  /* ---------- mirrors ---------- */

  function setupMirrors(mirrors, defaultMirror) {
    const select = document.getElementById("mirror");
    select.innerHTML = "";

    const list = Array.isArray(mirrors) && mirrors.length
      ? mirrors
      : [{ name: "官方 GitHub 源链", prefix: "" }];

    list.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.prefix || "";
      opt.textContent = m.name;
      select.appendChild(opt);
    });

    // pick default
    const saved = localStorage.getItem(STORAGE_KEY);
    let target = saved;
    if (target == null || ![...select.options].some((o) => o.value === target)) {
      target = "";
      if (defaultMirror) {
        const found = list.find((m) => m.name === defaultMirror);
        if (found) target = found.prefix || "";
      }
    }
    select.value = target;
    currentMirrorPrefix = select.value;

    select.addEventListener("change", () => {
      currentMirrorPrefix = select.value;
      localStorage.setItem(STORAGE_KEY, currentMirrorPrefix);
      renderReleases();
    });
  }

  function buildDownloadUrl(originalUrl) {
    if (!currentMirrorPrefix) return originalUrl;
    return currentMirrorPrefix + originalUrl;
  }

  /* ---------- rendering ---------- */

  function renderHeader(cfg) {
    document.getElementById("page-title").textContent = cfg.title || "CuRelease";
    document.title = cfg.title || "CuRelease";
    document.getElementById("repo-owner").textContent = cfg.repo.owner;
    document.getElementById("repo-name").textContent = cfg.repo.name;
    document.getElementById("repo-desc").textContent = cfg.description || "";
    const link = `https://github.com/${cfg.repo.owner}/${cfg.repo.name}`;
    const repoLink = document.getElementById("repo-link");
    repoLink.href = link;
    repoLink.textContent = link;
  }

  function renderLastUpdated(iso) {
    const el = document.getElementById("last-updated");
    if (!iso) {
      el.textContent = "";
      return;
    }
    el.textContent = `数据更新于 ${formatDate(iso)}`;
  }

  function renderRelease(release, cfg) {
    const showDownloadCount = cfg.downloads?.show_download_count !== false;
    const showOfficial = cfg.downloads?.show_official !== false;
    const showBody = cfg.ui?.show_release_body !== false;

    const assetsHtml = (release.assets || [])
      .map((asset) => {
        const name = escapeHtml(asset.name);
        const size = escapeHtml(formatSize(asset.size));
        const count = showDownloadCount
          ? `<span>· ${formatNumber(asset.download_count)} 次下载</span>`
          : "";
        const downloadUrl = escapeHtml(buildDownloadUrl(asset.browser_download_url));
        const officialUrl = escapeHtml(asset.browser_download_url);

        const officialBtn = showOfficial
          ? `<a class="btn" href="${officialUrl}" target="_blank" rel="noopener">官方源链</a>`
          : "";

        return `
          <div class="asset">
            <div class="asset-info">
              <div class="asset-name">${name}</div>
              <div class="asset-meta">${size} ${count}</div>
            </div>
            <div class="asset-actions">
              <a class="btn btn-primary" href="${downloadUrl}" target="_blank" rel="noopener">下载</a>
              ${officialBtn}
            </div>
          </div>
        `;
      })
      .join("");

    const label = release.prerelease
      ? '<span class="Label Label--attention">Pre-release</span>'
      : '<span class="Label Label--success">Latest</span>';

    const author = release.author
      ? `<span class="release-author">
           <img src="${escapeHtml(release.author.avatar_url)}" alt="" />
           <span>${escapeHtml(release.author.login)}</span>
         </span>`
      : "";

    const bodyHtml = showBody && release.body
      ? `<div class="release-body markdown-body">${renderMarkdown(release.body)}</div>`
      : "";

    return `
      <section class="release">
        <div class="release-header">
          <div class="release-title">
            <a class="tag Link" href="${escapeHtml(release.html_url)}" target="_blank" rel="noopener">${escapeHtml(release.tag_name)}</a>
            <span>${escapeHtml(release.name || release.tag_name)}</span>
            ${label}
          </div>
          <div class="release-meta">
            ${author}
            <span>· ${formatDate(release.published_at)}</span>
          </div>
        </div>
        ${bodyHtml}
        <div class="assets">${assetsHtml}</div>
      </section>
    `;
  }

  function renderReleases() {
    if (!data) return;
    const cfg = data.config || {};
    const releases = data.releases || [];
    const container = document.getElementById("releases");
    const status = document.getElementById("status");

    if (!releases.length) {
      container.innerHTML = "";
      status.textContent = "暂无 Release。";
      return;
    }

    status.textContent = "";
    container.innerHTML = releases.map((r) => renderRelease(r, cfg)).join("");
  }

  /* ---------- bootstrap ---------- */

  async function load() {
    const status = document.getElementById("status");
    try {
      const res = await fetch("releases.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`加载失败：HTTP ${res.status}`);
      data = await res.json();

      const cfg = data.config || {};
      setupMarkdown();
      setupTheme(cfg.ui?.default_theme);
      setupMirrors(cfg.downloads?.mirrors, cfg.downloads?.default_mirror);
      renderHeader(cfg);
      renderLastUpdated(data.generated_at);
      renderReleases();
    } catch (err) {
      status.textContent = `加载失败：${err.message}`;
      console.error(err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
