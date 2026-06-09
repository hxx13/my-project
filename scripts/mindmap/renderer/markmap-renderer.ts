import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MindmapDocument } from '../types.js';
import { ensureOutputDir } from '../yaml-io.js';

/**
 * Generate a self-contained interactive HTML file using markmap.
 *
 * The HTML loads markmap-view + markmap-lib from CDN (d3 as dependency).
 * No build step needed — just open the .html file in a browser.
 */
export function renderMarkmap(doc: MindmapDocument): void {
  const outputDir = ensureOutputDir('');

  // Build markdown content for markmap
  const markdown = buildMarkmapMarkdown(doc);

  // Read template
  const templatePath = path.join(import.meta.dirname, '..', 'templates', 'markmap.html');
  const outputPath = path.join(outputDir, 'mindmap.html');

  if (!fs.existsSync(templatePath)) {
    console.warn('  ⚠ markmap template not found at', templatePath);
    return;
  }

  let html = fs.readFileSync(templatePath, 'utf-8');

  // Inject data
  const title = doc.meta.project + ' 业务逻辑导图';
  const timestamp = new Date(doc.meta.generated).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
  });

  html = html.replace('{{TITLE}}', title);
  html = html.replace('{{TIMESTAMP}}', timestamp);
  html = html.replace('{{MARKDOWN_CONTENT}}', JSON.stringify(markdown));
  html = html.replace('{{DOMAIN_LIST}}', JSON.stringify(
    doc.domains.map(d => ({
      id: d.id,
      name: d.name || d.id,
      summary: d.summary,
      controllers: d.modules.reduce((sum, m) => sum + m.controllers.length, 0),
      services: d.modules.reduce((sum, m) => sum + m.services.length, 0),
      apis: d.modules.reduce((sum, m) => sum + m.controllers.reduce((s, c) => s + c.apis.length, 0), 0),
      pages: d.frontend.length,
    }))
  ));
  html = html.replace('{{CROSS_CUTTING}}', JSON.stringify(
    doc.cross_cutting.map(cc => ({
      name: cc.name,
      description: cc.description,
      involved_modules: cc.involved_modules,
      flow: cc.flow,
    }))
  ));

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`  ✓ mindmap.html generated (${(html.length / 1024).toFixed(1)} KB)`);
}

/**
 * Build a markdown tree that markmap renders as an interactive mind map.
 *
 * Structure:
 *   # Root
 *   ## Domain 1 (with name if set)
 *     ### Controllers
 *       #### ControllerName
 *         ##### GET /api/xxx
 *     ### Services
 *       #### ServiceName
 *     ### Frontend Pages
 *       #### /route/path
 *   ## Cross-Cutting
 *     ### Concern Name
 */
function buildMarkmapMarkdown(doc: MindmapDocument): string {
  const lines: string[] = [];

  lines.push(`# ${doc.meta.project}`);
  lines.push('');

  for (const domain of doc.domains) {
    const label = domain.name ? `${domain.name}` : domain.id;
    lines.push(`## ${label}`);
    if (domain.summary) lines.push(`*${domain.summary}*`);

    const ctrlCount = domain.modules.reduce((s, m) => s + m.controllers.length, 0);
    const svcCount = domain.modules.reduce((s, m) => s + m.services.length, 0);

    if (ctrlCount > 0) {
      lines.push(`### Controllers (${ctrlCount})`);
      for (const mod of domain.modules) {
        for (const ctrl of mod.controllers) {
          const apiCount = ctrl.apis.length;
          lines.push(`#### ${ctrl.class}`);
          if (ctrl.base_path) lines.push(`*${ctrl.base_path}*`);
          for (const api of ctrl.apis.slice(0, 6)) {
            lines.push(`##### [${api.method}] ${api.full_path}`);
          }
          if (ctrl.apis.length > 6) {
            lines.push(`##### ... +${ctrl.apis.length - 6} more`);
          }
        }
      }
    }

    if (svcCount > 0) {
      lines.push(`### Services (${svcCount})`);
      for (const mod of domain.modules) {
        for (const svc of mod.services.slice(0, 8)) {
          lines.push(`#### ${svc.class}`);
          for (const dep of svc.dependencies.slice(0, 5)) {
            lines.push(`##### → ${dep}`);
          }
        }
      }
      if (svcCount > 8) {
        lines.push(`#### ... +${svcCount - 8} more services`);
      }
    }

    // Business rules
    if (domain.business_rules.length > 0) {
      lines.push('### 业务规则');
      for (const rule of domain.business_rules) {
        lines.push(`#### ${rule}`);
      }
    }

    // Data flows
    if (domain.data_flows.length > 0) {
      lines.push('### 核心流程');
      for (const flow of domain.data_flows) {
        lines.push(`#### ${flow.name}`);
        for (const step of flow.steps) {
          lines.push(`##### ${step}`);
        }
      }
    }

    // Frontend pages
    if (domain.frontend.length > 0) {
      lines.push('### 前端页面');
      for (const page of domain.frontend) {
        lines.push(`#### \`${page.route}\``);
        for (const call of page.api_calls.slice(0, 5)) {
          lines.push(`##### ${call}`);
        }
      }
    }

    // Pending items
    if (domain.pending.length > 0) {
      lines.push('### ⚠ 待补充');
      for (const p of domain.pending) {
        lines.push(`#### ${p}`);
      }
    }

    lines.push('');
  }

  // Cross-cutting section
  if (doc.cross_cutting.length > 0) {
    lines.push('## 横切关注点');
    for (const cc of doc.cross_cutting) {
      lines.push(`### ${cc.name}`);
      if (cc.description) lines.push(cc.description);
      if (cc.involved_modules.length > 0) {
        lines.push(`#### 模块: ${cc.involved_modules.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
}
