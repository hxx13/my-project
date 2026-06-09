import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MindmapDocument, Domain } from '../types.js';
import { ensureOutputDir } from '../yaml-io.js';

/**
 * Generate an .xmind file from the MindmapDocument.
 *
 * The .xmind format is a ZIP containing XML files:
 *   - content.xml    — the mind map structure
 *   - META-INF/manifest.xml — file listing
 *   - metadata.xml   — author/timestamp
 *
 * We use the `archiver` npm package for ZIP creation.
 */
export async function renderXMind(doc: MindmapDocument): Promise<void> {
  const outputDir = ensureOutputDir('');
  const outputPath = path.join(outputDir, 'mindmap.xmind');

  let Archiver: any;
  try {
    const mod = await import('archiver');
    Archiver = mod.default || mod;
  } catch {
    console.warn('  ⚠ archiver not available, writing raw content.xml');
    const contentPath = path.join(outputDir, 'mindmap.content.xml');
    fs.writeFileSync(contentPath, buildContentXml(doc), 'utf-8');
    console.log('  ⚠ Wrote raw XML — you can import this into XMind manually');
    return;
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = Archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const size = (archive as any).pointer?.() ?? 0;
      console.log(`  ✓ mindmap.xmind generated (${formatSize(size)})`);
      resolve();
    });

    archive.on('error', (err: Error) => {
      console.warn('  ⚠ ZIP error, falling back to raw XML');
      const contentPath = path.join(outputDir, 'mindmap.content.xml');
      fs.writeFileSync(contentPath, buildContentXml(doc), 'utf-8');
      resolve(); // don't reject — raw XML is a usable fallback
    });

    archive.pipe(output);

    // Add content.xml
    archive.append(buildContentXml(doc), { name: 'content.xml' });

    // Add manifest
    archive.append(buildManifest(), { name: 'META-INF/manifest.xml' });

    // Add metadata
    archive.append(buildMetadata(doc), { name: 'metadata.xml' });

    archive.finalize();
  });
}

// ---- XML Builders ----

function buildContentXml(doc: MindmapDocument): string {
  const parts: string[] = [];

  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  parts.push('<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0">');

  // One sheet per domain + overview
  // Sheet 0: Overview
  parts.push(`<sheet id="overview" title="业务全景" timestamp="${Date.now()}">`);
  parts.push(`<topic id="root" structure-class="org.xmind.ui.map.unbalanced" timestamp="${Date.now()}">`);
  parts.push(`<title>${esc(doc.meta.project)} 业务逻辑全景</title>`);

  // Build children for overview
  parts.push('<children><topics type="attached">');

  for (const domain of doc.domains) {
    const ctrlCount = domain.modules.reduce((s, m) => s + m.controllers.length, 0);
    const apiCount = domain.modules.reduce((s, m) => s + m.controllers.reduce((s2, c) => s2 + c.apis.length, 0), 0);
    const svcCount = domain.modules.reduce((s, m) => s + m.services.length, 0);
    const label = domain.name ? `${domain.name}` : domain.id;

    parts.push(`<topic id="ov-${domain.id}">`);
    parts.push(`<title>${esc(label)}</title>`);

    if (ctrlCount > 0 || svcCount > 0) {
      parts.push('<children><topics type="attached">');
      if (ctrlCount > 0) parts.push(`<topic><title>${ctrlCount} 控制器 / ${apiCount} API</title></topic>`);
      if (svcCount > 0) parts.push(`<topic><title>${svcCount} 服务</title></topic>`);
      if (domain.frontend.length > 0) parts.push(`<topic><title>${domain.frontend.length} 前端页面</title></topic>`);
      if (domain.business_rules.length > 0) {
        parts.push('<topic><title>业务规则</title>');
        parts.push('<children><topics type="attached">');
        for (const rule of domain.business_rules) {
          parts.push(`<topic><title>${esc(rule)}</title></topic>`);
        }
        parts.push('</topics></children></topic>');
      }
      parts.push('</topics></children>');
    }

    parts.push('</topic>');
  }

  // Cross-cutting branch
  if (doc.cross_cutting.length > 0) {
    parts.push('<topic id="ov-crosscutting"><title>横切关注点</title>');
    parts.push('<children><topics type="attached">');
    for (const cc of doc.cross_cutting) {
      parts.push(`<topic><title>${esc(cc.name)}</title></topic>`);
    }
    parts.push('</topics></children></topic>');
  }

  parts.push('</topics></children>');
  parts.push('</topic></sheet>');

  // Per-domain sheets
  for (const domain of doc.domains) {
    parts.push(buildDomainSheet(domain));
  }

  parts.push('</xmap-content>');
  return parts.join('\n');
}

function buildDomainSheet(domain: Domain): string {
  const parts: string[] = [];
  const label = domain.name || domain.id;

  parts.push(`<sheet id="domain-${domain.id}" title="${esc(label)}" timestamp="${Date.now()}">`);
  parts.push(`<topic id="root-${domain.id}" structure-class="org.xmind.ui.map.unbalanced">`);
  parts.push(`<title>${esc(label)}</title>`);

  if (domain.summary) {
    parts.push(`<notes><plain>${esc(domain.summary)}</plain></notes>`);
  }

  parts.push('<children><topics type="attached">');

  // Controllers branch
  const controllers = domain.modules.flatMap(m => m.controllers);
  if (controllers.length > 0) {
    parts.push('<topic><title>控制器</title>');
    parts.push('<children><topics type="attached">');
    for (const ctrl of controllers) {
      parts.push(`<topic><title>${esc(ctrl.class)}</title>`);
      if (ctrl.apis.length > 0) {
        parts.push('<children><topics type="attached">');
        for (const api of ctrl.apis.slice(0, 8)) {
          parts.push(`<topic><title>${api.method} ${esc(api.full_path)}</title></topic>`);
        }
        if (ctrl.apis.length > 8) {
          parts.push(`<topic><title>... +${ctrl.apis.length - 8} more</title></topic>`);
        }
        parts.push('</topics></children>');
      }
      parts.push('</topic>');
    }
    parts.push('</topics></children></topic>');
  }

  // Services branch
  const services = domain.modules.flatMap(m => m.services);
  if (services.length > 0) {
    parts.push('<topic><title>服务</title>');
    parts.push('<children><topics type="attached">');
    for (const svc of services.slice(0, 10)) {
      parts.push(`<topic><title>${esc(svc.class)}</title>`);
      if (svc.dependencies.length > 0) {
        parts.push('<children><topics type="attached">');
        for (const dep of svc.dependencies) {
          parts.push(`<topic><title>→ ${esc(dep)}</title></topic>`);
        }
        parts.push('</topics></children>');
      }
      parts.push('</topic>');
    }
    if (services.length > 10) {
      parts.push(`<topic><title>... +${services.length - 10} more</title></topic>`);
    }
    parts.push('</topics></children></topic>');
  }

  // Business rules branch
  if (domain.business_rules.length > 0) {
    parts.push('<topic><title>业务规则</title>');
    parts.push('<children><topics type="attached">');
    for (const rule of domain.business_rules) {
      parts.push(`<topic><title>${esc(rule)}</title></topic>`);
    }
    parts.push('</topics></children></topic>');
  }

  // Data flows branch
  if (domain.data_flows.length > 0) {
    parts.push('<topic><title>核心流程</title>');
    parts.push('<children><topics type="attached">');
    for (const flow of domain.data_flows) {
      parts.push(`<topic><title>${esc(flow.name)}</title>`);
      parts.push('<children><topics type="attached">');
      for (const step of flow.steps) {
        parts.push(`<topic><title>${esc(step)}</title></topic>`);
      }
      parts.push('</topics></children></topic>');
    }
    parts.push('</topics></children></topic>');
  }

  // Frontend pages branch
  if (domain.frontend.length > 0) {
    parts.push('<topic><title>前端页面</title>');
    parts.push('<children><topics type="attached">');
    for (const page of domain.frontend) {
      parts.push(`<topic><title>${esc(page.route)}</title>`);
      parts.push('<children><topics type="attached">');
      for (const call of page.api_calls.slice(0, 5)) {
        parts.push(`<topic><title>${esc(call)}</title></topic>`);
      }
      parts.push('</topics></children></topic>');
    }
    parts.push('</topics></children></topic>');
  }

  // Interactions branch
  if (domain.interactions.length > 0) {
    parts.push('<topic><title>域间交互</title>');
    parts.push('<children><topics type="attached">');
    for (const int of domain.interactions) {
      parts.push(`<topic><title>→ ${esc(int.target)} (${int.type})</title></topic>`);
    }
    parts.push('</topics></children></topic>');
  }

  parts.push('</topics></children>');
  parts.push('</topic></sheet>');

  return parts.join('\n');
}

function buildManifest(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0">
  <file-entry full-path="content.xml" media-type="text/xml"/>
  <file-entry full-path="META-INF/" media-type=""/>
  <file-entry full-path="META-INF/manifest.xml" media-type="text/xml"/>
  <file-entry full-path="metadata.xml" media-type="text/xml"/>
</manifest>`;
}

function buildMetadata(doc: MindmapDocument): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<meta xmlns="urn:xmind:xmap:xmlns:meta:2.0" version="2.0">
  <Author><Name>TwinSystem Mindmap Tool</Name></Author>
  <Create><Time>${doc.meta.generated}</Time></Create>
  <Creator><Name>TwinSystem Mindmap Tool v${doc.meta.scanner_version}</Name></Creator>
</meta>`;
}

// ---- Helpers ----

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
