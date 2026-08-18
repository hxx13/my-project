/**
 * 从 adminNavRegistry.ts + studentNavRegistry.ts + router/index.tsx 导出页面权限 manifest。
 * 输出：src/main/resources/page-permission/admin-nav.manifest.json
 *
 * 用法：node scripts/export-admin-nav-manifest.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const registryTs = fs.readFileSync(
  path.join(root, "frontend/src/features/admin/adminNavRegistry.ts"),
  "utf8"
);
const routerTs = fs.readFileSync(path.join(root, "frontend/src/router/index.tsx"), "utf8");
const studentRegistryTs = fs.readFileSync(
  path.join(root, "frontend/src/features/student/nav/studentNavRegistry.ts"),
  "utf8"
);

function norm(p) {
  if (!p) return "";
  const v = p.startsWith("/") ? p : `/${p}`;
  return v.replace(/\/+/g, "/");
}

/** 全局扫描注册项，再按位置归属到最近的分组 title */
function parseRegistry(registry, constName = "ADMIN_NAV_REGISTRY") {
  const arrayStart = registry.indexOf(`export const ${constName}`);
  const slice = arrayStart >= 0 ? registry.slice(arrayStart) : registry;

  const groupSpans = [];
  // 仅匹配顶级/子级 GROUP 块（4 或 6 空格缩进的 id + title），避免把 ITEM 的 id 误判为分组
  const groupRe = /^\s{4}id:\s*"([^"]+)"\s*,\s*\n\s{4}title:\s*"([^"]+)"/gm;
  let gm;
  while ((gm = groupRe.exec(slice)) !== null) {
    groupSpans.push({ index: gm.index, groupTitle: gm[2] });
  }
  // SUBGROUP：6 空格 id + title（嵌套在 subgroups 数组内）
  const subgroupRe = /^\s{6}id:\s*"([^"]+)"\s*,\s*\n\s{6}title:\s*"([^"]+)"/gm;
  while ((gm = subgroupRe.exec(slice)) !== null) {
    groupSpans.push({ index: gm.index, groupTitle: gm[2] });
  }
  groupSpans.sort((a, b) => a.index - b.index);

  function groupTitleForIndex(idx) {
    let title = "未分组";
    for (const g of groupSpans) {
      if (g.index <= idx) title = g.groupTitle;
      else break;
    }
    return title;
  }

  const items = [];
  const itemRe =
    /\{\s*id:\s*"([^"]+)"\s*,\s*path:\s*"([^"]+)"\s*,\s*[\r\n]+\s*label:\s*"([^"]+)"[\s\S]*?fallbackMinRole:\s*"([A-Z_]+)"/g;
  let m;
  while ((m = itemRe.exec(slice)) !== null) {
    items.push({
      registryId: m[1],
      path: norm(m[2]),
      label: m[3],
      fallbackMinRole: m[4],
      groupTitle: groupTitleForIndex(m.index),
    });
  }
  return items;
}

/** 从 router 提取 /admin 下全量 PAGE 路径（正确拼接前缀） */
function parseAdminRoutes(router) {
  const paths = new Set(["/admin"]);
  const adminIdx = router.indexOf('path: "/admin"');
  if (adminIdx < 0) return paths;

  const slice = router.slice(adminIdx);
  const pathRe = /path:\s*"([^"]+)"/g;
  let m;
  while ((m = pathRe.exec(slice)) !== null) {
    const raw = m[1];
    if (raw === "/admin") continue;
    if (raw.startsWith("/admin")) {
      paths.add(norm(raw));
      continue;
    }
    if (raw.startsWith("/")) continue;
    paths.add(norm(`/admin/${raw}`));
  }
  return paths;
}

/** Twin 根路由（非 /admin） */
function parseTwinRootRoutes(router) {
  const paths = new Set();
  const twinStart = router.indexOf('path: "/"');
  const adminStart = router.indexOf('path: "/admin"');
  const slice = router.slice(twinStart, adminStart > twinStart ? adminStart : router.length);
  const pathRe = /path:\s*"([^"]+)"/g;
  const redirectOnly = new Set(["profile-security", "messages"]);
  let m;
  while ((m = pathRe.exec(slice)) !== null) {
    const raw = m[1];
    if (!raw || raw === "/" || raw.startsWith("/admin")) continue;
    if (redirectOnly.has(raw)) continue;
    if (raw.startsWith("/")) paths.add(norm(raw));
    else if (!raw.includes(":")) paths.add(norm(`/${raw}`));
  }
  return paths;
}

const registryItems = parseRegistry(registryTs);
const registryByPath = new Map(registryItems.map((it) => [it.path, it]));

const studentItems = parseRegistry(studentRegistryTs, "STUDENT_NAV_REGISTRY");

const adminPages = parseAdminRoutes(routerTs);
const twinPages = parseTwinRootRoutes(routerTs);

const pages = [];
const pagePaths = new Set();

function addPage(p, meta = {}) {
  const pagePath = norm(p);
  if (!pagePath || pagePaths.has(pagePath)) return;
  pagePaths.add(pagePath);
  const reg = registryByPath.get(pagePath);
  pages.push({
    path: pagePath,
    label: meta.label || reg?.label || pagePath,
    fallbackMinRole: meta.fallbackMinRole || reg?.fallbackMinRole || null,
    groupTitle: meta.groupTitle || reg?.groupTitle || null,
    registryId: reg?.registryId || null,
  });
}

for (const p of adminPages) addPage(p);
for (const p of twinPages) addPage(p);
for (const it of registryItems) addPage(it.path, it);
for (const it of studentItems) {
  addPage(it.path, {
    label: it.label,
    fallbackMinRole: it.fallbackMinRole || "MEMBER",
    groupTitle: it.groupTitle,
  });
}

// 只输出 pages 中未覆盖的 sidebar 条目（pages 已包含所有 registry 路径，避免 nav-manager 重复显示）
const sidebarEntries = registryItems
  .filter((it) => !pagePaths.has(it.path))
  .map((it) => ({
    path: it.path,
    label: it.label,
    fallbackMinRole: it.fallbackMinRole,
    groupTitle: it.groupTitle,
    registryId: it.registryId,
    entrySource: "sidebar",
  }));

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  pages: pages.sort((a, b) => a.path.localeCompare(b.path)),
  sidebarEntries: sidebarEntries.sort((a, b) => a.path.localeCompare(b.path)),
};

const outPath = path.join(root, "src/main/resources/page-permission/admin-nav.manifest.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(
  `[export-admin-nav-manifest] pages=${pages.length} sidebarEntries=${sidebarEntries.length} -> ${outPath}`
);
