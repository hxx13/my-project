#!/usr/bin/env npx tsx
/**
 * TwinSystem Mindmap CLI — 网站业务逻辑导图工具
 *
 * Usage:
 *   npm run mindmap               scan + render (default)
 *   npm run mindmap -- scan        scan only → update mindmap.yaml
 *   npm run mindmap -- render      render only → from mindmap.yaml
 *   npm run mindmap -- check       CI sync check (exit 1 if out of sync)
 */

import { readMindmapYaml, createEmptyDocument, writeMindmapYaml } from './yaml-io.js';
import { scanAll } from './scanner/index.js';
import { mergeScanResult } from './scanner/merger.js';
import { renderAll } from './renderer/index.js';
import { checkSync } from './checker.js';

const command = process.argv[2] || 'all';

async function main(): Promise<void> {
  printBanner();

  switch (command) {
    case 'scan':
      await doScan();
      break;

    case 'render': {
      const doc = readMindmapYaml();
      if (!doc) {
        console.error('❌ mindmap.yaml not found.');
        console.error('   Run: npm run mindmap scan');
        process.exit(1);
      }
      await renderAll(doc);
      break;
    }

    case 'check':
      await checkSync();
      break;

    case 'all':
    default:
      await doScan();
      const doc = readMindmapYaml();
      if (doc) await renderAll(doc);
      break;
  }

  console.log('✨ Done.\n');
}

async function doScan(): Promise<void> {
  console.log('\n📡 Scanning source code...\n');

  // Load existing or create new
  let doc = readMindmapYaml();
  if (!doc) {
    console.log('  No existing mindmap.yaml — creating new one.');
    doc = createEmptyDocument();
  }

  // Scan sources
  const scanResult = scanAll();

  // Stats
  const totalCtrls = scanResult.domains.reduce(
    (s, d) => s + d.modules.reduce((s2, m) => s2 + m.controllers.length, 0), 0
  );
  const totalSvcs = scanResult.domains.reduce(
    (s, d) => s + d.modules.reduce((s2, m) => s2 + m.services.length, 0), 0
  );
  const totalApis = scanResult.domains.reduce(
    (s, d) =>
      s +
      d.modules.reduce((s2, m) => s2 + m.controllers.reduce((s3, c) => s3 + c.apis.length, 0), 0),
    0
  );
  const totalPages = scanResult.domains.reduce((s, d) => s + d.frontend.length, 0);

  console.log(`  ✓ ${scanResult.domains.length} business domains`);
  console.log(`  ✓ ${totalCtrls} controllers / ${totalSvcs} services / ${totalApis} API endpoints`);
  console.log(`  ✓ ${totalPages} frontend pages mapped`);

  if (scanResult.warnings.length > 0) {
    console.log(`  ⚠ ${scanResult.warnings.length} warnings:`);
    for (const w of scanResult.warnings.slice(0, 5)) {
      console.log(`    - ${w}`);
    }
    if (scanResult.warnings.length > 5) {
      console.log(`    ... and ${scanResult.warnings.length - 5} more`);
    }
  }

  // Merge
  mergeScanResult(doc, scanResult);

  // Write
  writeMindmapYaml(doc);
  console.log('\n✅ mindmap.yaml updated.\n');
}

function printBanner(): void {
  console.log([
    '',
    '╔══════════════════════════════════════════╗',
    '║     TwinSystem Mindmap Tool v0.1.0       ║',
    '║      网站业务逻辑全景导图工具               ║',
    '╚══════════════════════════════════════════╝',
    '',
  ].join('\n'));
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
