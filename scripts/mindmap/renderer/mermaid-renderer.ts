import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MindmapDocument, Domain } from '../types.js';
import { ensureOutputDir } from '../yaml-io.js';

/**
 * Generate Mermaid-enhanced Markdown documentation from a MindmapDocument.
 *
 * Output structure:
 *   docs/mindmap/mermaid/
 *   ├── 00-overview.md        — all domains at a glance
 *   ├── 01-{domain-id}.md     — per-domain detail
 *   ├── ...
 *   ├── cross-cutting.md      — cross-cutting concerns
 *   └── glossary.md           — term definitions
 */
export function renderMermaid(doc: MindmapDocument): void {
  const outputDir = ensureOutputDir('mermaid');

  // 00-overview
  const overview = generateOverview(doc);
  fs.writeFileSync(path.join(outputDir, '00-overview.md'), overview, 'utf-8');

  // Per-domain pages
  doc.domains.forEach((domain, i) => {
    const num = String(i + 1).padStart(2, '0');
    const filename = `${num}-${domain.id}.md`;
    const content = generateDomainDoc(domain, doc.domains);
    fs.writeFileSync(path.join(outputDir, filename), content, 'utf-8');
  });

  // Cross-cutting
  if (doc.cross_cutting.length > 0) {
    const cc = generateCrossCuttingDoc(doc);
    fs.writeFileSync(path.join(outputDir, 'cross-cutting.md'), cc, 'utf-8');
  }

  // Glossary
  if (doc.annotations.glossary.length > 0) {
    const gl = generateGlossaryDoc(doc);
    fs.writeFileSync(path.join(outputDir, 'glossary.md'), gl, 'utf-8');
  }

  console.log(`  ✓ ${doc.domains.length + 1} Mermaid docs generated`);
}

// ---- Overview ----

function generateOverview(doc: MindmapDocument): string {
  const lines: string[] = [];
  lines.push('# TwinSystem 业务逻辑全景', '');
  lines.push(`> 自动生成于 ${formatTs(doc.meta.generated)} | Scanner v${doc.meta.scanner_version}`, '');

  // Domain mindmap
  lines.push('## 业务域总览', '');
  lines.push('```mermaid');
  lines.push('mindmap');
  lines.push('  root((TwinSystem))');

  // Group by category
  const withName = doc.domains.filter(d => d.name);
  const unnamed = doc.domains.filter(d => !d.name);

  if (withName.length > 0) {
    lines.push('    已标注');
    for (const d of withName) {
      const ctrlCount = d.modules.reduce((s, m) => s + m.controllers.length, 0);
      const apiCount = d.modules.reduce((s, m) => s + m.controllers.reduce((s2, c) => s2 + c.apis.length, 0), 0);
      lines.push(`      ${d.name}`);
      lines.push(`        id: ${d.id}`);
      if (ctrlCount > 0) lines.push(`        ${ctrlCount} controllers`);
      if (apiCount > 0) lines.push(`        ${apiCount} APIs`);
    }
  }

  if (unnamed.length > 0) {
    lines.push('    待标注');
    for (const d of unnamed) {
      const ctrlCount = d.modules.reduce((s, m) => s + m.controllers.length, 0);
      const apiCount = d.modules.reduce((s, m) => s + m.controllers.reduce((s2, c) => s2 + c.apis.length, 0), 0);
      lines.push(`      ${d.id}`);
      if (ctrlCount > 0) lines.push(`        ${ctrlCount} controllers`);
      if (apiCount > 0) lines.push(`        ${apiCount} APIs`);
    }
  }

  lines.push('```', '');

  // Domain statistics table
  lines.push('## 统计', '');
  lines.push('| 业务域 | 控制器 | 服务 | API | 页面 | 交互 |');
  lines.push('|--------|--------|------|-----|------|------|');
  for (const d of doc.domains) {
    const ctrls = d.modules.reduce((s, m) => s + m.controllers.length, 0);
    const svcs = d.modules.reduce((s, m) => s + m.services.length, 0);
    const apis = d.modules.reduce((s, m) => s + m.controllers.reduce((s2, c) => s2 + c.apis.length, 0), 0);
    const pages = d.frontend.length;
    const ints = d.interactions.length;
    const label = d.name ? `${d.name} (${d.id})` : d.id;
    lines.push(`| ${label} | ${ctrls} | ${svcs} | ${apis} | ${pages} | ${ints} |`);
  }
  lines.push('');

  // Cross-domain interactions summary
  lines.push('## 域间交互', '');
  const allInteractions = doc.domains.flatMap(d =>
    d.interactions.map(i => ({ from: d.id, fromName: d.name || d.id, ...i }))
  );
  if (allInteractions.length > 0) {
    lines.push('```mermaid');
    lines.push('flowchart LR');
    const seen = new Set<string>();
    for (const int of allInteractions) {
      const key = `${int.from}->${int.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        const fromLabel = int.fromName;
        const toDomain = doc.domains.find(d => d.id === int.target);
        const toLabel = toDomain?.name || int.target;
        lines.push(`    ${sanitizeId(int.from)}["${fromLabel}"] --> ${sanitizeId(int.target)}["${toLabel}"]`);
      }
    }
    lines.push('```', '');
  }

  return lines.join('\n');
}

// ---- Single Domain ----

function generateDomainDoc(domain: Domain, allDomains: Domain[]): string {
  const lines: string[] = [];
  const title = domain.name ? `# ${domain.name}` : `# ${domain.id}`;
  lines.push(title, '');

  if (domain.name) lines.push(`**ID:** \`${domain.id}\``, '');
  if (domain.summary) lines.push(`> ${domain.summary}`, '');
  if (domain.description) lines.push(domain.description, '');

  // Business actors
  if (domain.business_actors.length > 0) {
    lines.push('## 业务角色', '');
    domain.business_actors.forEach(a => lines.push(`- ${a}`));
    lines.push('');
  }

  // Business rules
  if (domain.business_rules.length > 0) {
    lines.push('## 业务规则', '');
    domain.business_rules.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }

  // Module structure mindmap
  lines.push('## 模块结构', '');
  lines.push('```mermaid');
  lines.push('mindmap');
  const rootLabel = domain.name || domain.id;
  lines.push(`  root((${rootLabel}))`);

  for (const mod of domain.modules) {
    const subPkg = mod.package.split('.').pop() || mod.package;

    // Controllers
    for (const ctrl of mod.controllers.slice(0, 5)) {
      lines.push(`    ${ctrl.class}`);
      for (const api of ctrl.apis.slice(0, 6)) {
        const apiLabel = `${api.method} ${api.full_path}`;
        lines.push(`      ${apiLabel}`);
      }
      if (ctrl.apis.length > 6) {
        lines.push(`      ... +${ctrl.apis.length - 6} more`);
      }
    }

    // Services
    for (const svc of mod.services.slice(0, 5)) {
      lines.push(`    ${svc.class}`);
      for (const dep of svc.dependencies.slice(0, 4)) {
        lines.push(`      → ${dep}`);
      }
    }
  }
  lines.push('```', '');

  // Data flows (manual)
  if (domain.data_flows.length > 0) {
    lines.push('## 核心流程', '');
    for (const flow of domain.data_flows) {
      lines.push(`### ${flow.name}`, '');
      lines.push(`**触发条件:** ${flow.trigger}`, '');
      lines.push('```mermaid');
      lines.push('flowchart TD');
      const stepIds = flow.steps.map((_, i) => `step${i}`);
      for (let i = 0; i < flow.steps.length; i++) {
        const stepText = flow.steps[i].replace(/^\d+\.\s*/, '');
        lines.push(`    ${stepIds[i]}["${stepText}"]`);
        if (i > 0) lines.push(`    ${stepIds[i - 1]} --> ${stepIds[i]}`);
      }
      lines.push('```', '');
    }
  }

  // Frontend pages table
  if (domain.frontend.length > 0) {
    lines.push('## 前端页面', '');
    lines.push('| 路由 | 组件 | API 调用数 |');
    lines.push('|------|------|-----------|');
    for (const page of domain.frontend) {
      lines.push(`| \`${page.route}\` | ${page.component} | ${page.api_calls.length} |`);
    }
    lines.push('');
  }

  // API list
  const allApis = domain.modules.flatMap(m =>
    m.controllers.flatMap(c => c.apis.map(a => ({ controller: c.class, ...a })))
  );
  if (allApis.length > 0) {
    lines.push('## API 清单', '');
    lines.push('| 方法 | 路径 | 控制器 | 说明 |');
    lines.push('|------|------|--------|------|');
    for (const api of allApis.slice(0, 50)) {
      lines.push(`| ${api.method} | \`${api.full_path}\` | ${api.controller} | ${api.summary} |`);
    }
    if (allApis.length > 50) {
      lines.push(`| ... | *${allApis.length - 50} more APIs* | | |`);
    }
    lines.push('');
  }

  // Interactions
  if (domain.interactions.length > 0) {
    lines.push('## 域间交互', '');
    for (const int of domain.interactions) {
      const targetDomain = allDomains.find(d => d.id === int.target);
      const targetLabel = targetDomain?.name || int.target;
      lines.push(`- **→ ${targetLabel}** (${int.type})${int.detail ? ` — ${int.detail}` : ''}`);
    }
    lines.push('');
  }

  // Pending items
  if (domain.pending.length > 0) {
    lines.push('## 待补充', '');
    domain.pending.forEach(p => lines.push(`- [ ] ${p}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ---- Cross-Cutting ----

function generateCrossCuttingDoc(doc: MindmapDocument): string {
  const lines: string[] = [];
  lines.push('# 横切关注点', '');

  for (const cc of doc.cross_cutting) {
    lines.push(`## ${cc.name}`, '');
    if (cc.description) lines.push(cc.description, '');
    if (cc.involved_modules.length > 0) {
      lines.push(`**涉及模块:** ${cc.involved_modules.join(', ')}`, '');
    }
    if (cc.flow) {
      lines.push('', cc.flow, '');
    }
    if (cc.notes) lines.push(`> 💡 ${cc.notes}`, '');
    lines.push('');
  }

  return lines.join('\n');
}

// ---- Glossary ----

function generateGlossaryDoc(doc: MindmapDocument): string {
  const lines: string[] = [];
  lines.push('# 术语表', '');
  lines.push('| 术语 | 含义 |');
  lines.push('|------|------|');
  for (const entry of doc.annotations.glossary) {
    lines.push(`| ${entry.term} | ${entry.meaning} |`);
  }
  return lines.join('\n');
}

// ---- Helpers ----

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch {
    return iso;
  }
}
