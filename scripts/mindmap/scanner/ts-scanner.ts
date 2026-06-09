import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FrontendPage } from '../types.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const FRONTEND_SRC = path.join(PROJECT_ROOT, 'frontend', 'src');

/**
 * Entry point: scan frontend source and return page-to-API mappings.
 */
export function scanFrontend(): { pages: FrontendPage[]; warnings: string[] } {
  const warnings: string[] = [];

  if (!fs.existsSync(FRONTEND_SRC)) {
    warnings.push(`Frontend src not found: ${FRONTEND_SRC}`);
    return { pages: [], warnings };
  }

  // Step 1: Parse routes from router
  const pages = parseRouterFiles(warnings);

  // Step 2: For each page, resolve API calls from its component
  for (const page of pages) {
    const componentFile = findComponentFile(page.component);
    if (componentFile) {
      const { apiCalls, stores } = analyzeComponent(componentFile);
      page.api_calls = apiCalls;
      page.stores = stores;
    }
  }

  return { pages, warnings };
}

// ---- Route Parsing ----

function parseRouterFiles(warnings: string[]): FrontendPage[] {
  const pages: FrontendPage[] = [];
  const seenRoutes = new Set<string>();

  const routerDir = path.join(FRONTEND_SRC, 'router');
  if (!fs.existsSync(routerDir)) {
    warnings.push('No router directory found');
    return pages;
  }

  const routeFiles = findTsFiles(routerDir);
  for (const file of routeFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const filePages = parseRoutes(content);
      for (const p of filePages) {
        if (!seenRoutes.has(p.route)) {
          seenRoutes.add(p.route);
          pages.push(p);
        }
      }
    } catch (e) {
      warnings.push(`Failed to read router file: ${file}`);
    }
  }

  return pages;
}

/**
 * Parse React Router route definitions from a file.
 *
 * Handles multiple patterns:
 *   1. JSX object:  { path: "/admin/users", element: <AdminUsersPage /> }
 *   2. index route: { index: true, element: <Navigate to="/x" replace /> }
 *   3. Nested:      children: [...]  (recursive)
 *   4. Lazy import: lazy(() => import("./pages/Foo"))
 */
function parseRoutes(content: string): FrontendPage[] {
  const pages: FrontendPage[] = [];

  // Pattern 1: { path: "xxx", element: <ComponentName /> }
  // or { path: "xxx", element: <ComponentName>...</ComponentName> }
  const pathRouteRe = /path\s*:\s*["']([^"']+)["'][^}]*?element\s*:\s*(?:\(\s*\)?\s*)?(?:<(\w+)(?:\s|\/[^>]*>|>[\s\S]*?<\/\2>))/g;
  let m: RegExpExecArray | null;
  while ((m = pathRouteRe.exec(content)) !== null) {
    const route = normalizeRoute(m[1]);
    const component = m[2];
    if (component && component !== 'Navigate' && component !== 'Redirect' && component !== 'Outlet') {
      pages.push({ route, component, api_calls: [], stores: [] });
    }
  }

  // Pattern 2: path + element on separate lines
  // path: "xxx",\n  element: <ComponentName />,
  const pathLineRe = /path\s*:\s*["']([^"']+)["'],\s*\n\s*element\s*:\s*(?:\(\s*\)?\s*)?<(\w+)/g;
  while ((m = pathLineRe.exec(content)) !== null) {
    const route = normalizeRoute(m[1]);
    const component = m[2];
    if (component && component !== 'Navigate' && component !== 'Redirect' && component !== 'Outlet') {
      const exists = pages.find(p => p.route === route && p.component === component);
      if (!exists) {
        pages.push({ route, component, api_calls: [], stores: [] });
      }
    }
  }

  // Pattern 3: element with JSX children wrapping (simpler pattern)
  // element: <ComponentName
  const elementRe = /element\s*:\s*(?:\(\s*\)?\s*)?<(\w+)(?:\s|\/[^>]*>|>[\s\S]{0,200}?<\/\1>)/g;
  while ((m = elementRe.exec(content)) !== null) {
    const component = m[1];
    // Find closest path before this element
    const beforeContent = content.substring(0, m.index);
    const pathBefore = beforeContent.match(/path\s*:\s*["']([^"']+)["']/g);
    if (pathBefore) {
      const lastPath = pathBefore[pathBefore.length - 1];
      const routeMatch = lastPath.match(/["']([^"']+)["']/);
      if (routeMatch) {
        const route = normalizeRoute(routeMatch[1]);
        const exists = pages.find(p => p.route === route);
        if (!exists && component !== 'Navigate' && component !== 'Redirect' && component !== 'Outlet') {
          pages.push({ route, component, api_calls: [], stores: [] });
        }
      }
    }
  }

  return pages;
}

/** Normalize route paths: ensure leading /, remove trailing slashes */
function normalizeRoute(p: string): string {
  let r = p.startsWith('/') ? p : '/' + p;
  r = r.replace(/\/$/, '') || '/';
  return r;
}

// ---- Component Resolution ----

function findComponentFile(componentName: string): string | null {
  const searchDirs = [
    path.join(FRONTEND_SRC, 'pages'),
    path.join(FRONTEND_SRC, 'components'),
    path.join(FRONTEND_SRC, 'features'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const result = searchComponentInDir(dir, componentName);
    if (result) return result;
  }

  return null;
}

function searchComponentInDir(dir: string, componentName: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = searchComponentInDir(fullPath, componentName);
      if (result) return result;
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      const basename = path.basename(entry.name, path.extname(entry.name));
      if (basename === componentName) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (new RegExp(`\\b${componentName}\\b`).test(content)) {
            return fullPath;
          }
        } catch { /* skip */ }
      } else {
        // Check if this file exports the component
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (new RegExp(`export\\s+(?:default\\s+)?(?:function|const)\\s+${componentName}\\b`).test(content)) {
            return fullPath;
          }
        } catch { /* skip */ }
      }
    }
  }
  return null;
}

// ---- Component Analysis ----

interface ComponentAnalysis {
  apiCalls: string[];
  stores: string[];
}

function analyzeComponent(filePath: string): ComponentAnalysis {
  const apiCalls: string[] = [];
  const stores: string[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Find API imports
    const apiImportPaths = extractApiImports(content);
    for (const importPath of apiImportPaths) {
      const resolved = resolveApiImportPath(importPath);
      if (resolved) {
        const endpoints = parseApiEndpoints(resolved);
        apiCalls.push(...endpoints);
      }
    }

    // Find store imports
    const storeRe = /import\s+\{[^}]*\b(use\w*(?:Store|Atom))\b[^}]*\}\s+from\s+['"]([^'"]*store[^'"]*)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = storeRe.exec(content)) !== null) {
      if (!stores.includes(m[1])) stores.push(m[1]);
    }
  } catch { /* skip */ }

  return { apiCalls: dedupe(apiCalls), stores };
}

/** Extract api-related import paths from component content */
function extractApiImports(content: string): string[] {
  const imports: string[] = [];
  // import { xxx } from '@/api/domains/scanner.api'
  // import scannerApi from '@/api/domains/scanner.api'
  const importRe = /import\s+(?:type\s+)?(?:\{[^}]+\}|\w+)\s+from\s+['"](@\/api\/[^'"]*api[^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

/** Resolve @/ import path to absolute file path */
function resolveApiImportPath(importPath: string): string | null {
  const relative = importPath.replace('@/', '');
  const candidates = [
    path.join(FRONTEND_SRC, relative),
    path.join(FRONTEND_SRC, relative + '.ts'),
    path.join(FRONTEND_SRC, relative + '.tsx'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Parse API endpoints from an API file.
 *
 * Detects:
 *   http.get('/endpoint')
 *   http.post('/endpoint', data)
 *   http.put('/endpoint', data)
 *   http.delete('/endpoint')
 *   axios.get('/endpoint')
 */
function parseApiEndpoints(filePath: string): string[] {
  const endpoints: string[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Match http.method('/path...') or http.method(`/path...`)
    const httpCallRe = /(?:http|axios|apiClient|client|request)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*[`']([^`'"]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = httpCallRe.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const urlPath = cleanUrlPath(m[2]);
      if (urlPath) {
        endpoints.push(`${method} /api/v1/twin${urlPath.startsWith('/') ? '' : '/'}${urlPath}`);
      }
    }

    // Match fetch('/api/...')
    const fetchRe = /fetch\s*\(\s*[`'](\/api[^`'"]+)[`']/gi;
    while ((m = fetchRe.exec(content)) !== null) {
      endpoints.push(`FETCH ${cleanUrlPath(m[1])}`);
    }
  } catch { /* skip */ }

  return endpoints;
}

function cleanUrlPath(raw: string): string {
  // Remove template literals and query params
  return raw
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '')
    .trim();
}

// ---- Utilities ----

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...findTsFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      results.push(fullPath);
    }
  }
  return results;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)].sort();
}
