import { readMindmapYaml, createEmptyDocument } from './yaml-io.js';
import { scanAll } from './scanner/index.js';
import { mergeScanResult } from './scanner/merger.js';
import type { MindmapDocument } from './types.js';

/**
 * CI check: re-scans source code and compares auto-generated structure
 * against the existing mindmap.yaml.
 *
 * Exit 0 → in sync
 * Exit 1 → out of sync (PR blocked until developer runs `npm run mindmap`)
 */
export async function checkSync(): Promise<void> {
  console.log('🔍 Checking mindmap.yaml sync status...\n');

  const existing = readMindmapYaml();
  if (!existing) {
    console.error('❌ mindmap.yaml not found.');
    console.error('   Run: npm run mindmap scan');
    process.exit(1);
  }

  // Fresh scan
  const scanResult = scanAll();

  // Merge into empty doc to get "what should exist"
  const fresh = createEmptyDocument();
  mergeScanResult(fresh, scanResult);

  // Compare structure counts
  const existingCounts = countStructure(existing);
  const freshCounts = countStructure(fresh);

  let dirty = false;
  const diffs: string[] = [];

  if (existingCounts.domains !== freshCounts.domains) {
    diffs.push(`  Domains: ${existingCounts.domains} → ${freshCounts.domains}`);
    dirty = true;
  }
  if (existingCounts.controllers !== freshCounts.controllers) {
    diffs.push(`  Controllers: ${existingCounts.controllers} → ${freshCounts.controllers}`);
    dirty = true;
  }
  if (existingCounts.apis !== freshCounts.apis) {
    diffs.push(`  API endpoints: ${existingCounts.apis} → ${freshCounts.apis}`);
    dirty = true;
  }
  if (existingCounts.services !== freshCounts.services) {
    diffs.push(`  Services: ${existingCounts.services} → ${freshCounts.services}`);
    dirty = true;
  }
  if (existingCounts.frontendPages !== freshCounts.frontendPages) {
    diffs.push(`  Frontend pages: ${existingCounts.frontendPages} → ${freshCounts.frontendPages}`);
    dirty = true;
  }

  // Also compare domain IDs
  const existingIds = new Set(existing.domains.map(d => d.id));
  const freshIds = new Set(fresh.domains.map(d => d.id));
  const added = [...freshIds].filter(id => !existingIds.has(id));
  const removed = [...existingIds].filter(id => !freshIds.has(id));

  if (added.length > 0) {
    diffs.push(`  New domains: ${added.join(', ')}`);
    dirty = true;
  }
  if (removed.length > 0) {
    diffs.push(`  Removed domains: ${removed.join(', ')}`);
    dirty = true;
  }

  if (dirty) {
    console.log('❌ mindmap.yaml is OUT OF SYNC with source code:\n');
    for (const diff of diffs) {
      console.log(diff);
    }
    console.log('\n👉 Run: npm run mindmap');
    process.exit(1);
  }

  console.log('✅ mindmap.yaml is in sync with source code.\n');
  console.log(`   ${existingCounts.domains} domains, ${existingCounts.controllers} controllers, ${existingCounts.apis} APIs`);
}

function countStructure(doc: MindmapDocument) {
  let controllers = 0;
  let apis = 0;
  let services = 0;
  let frontendPages = 0;

  for (const d of doc.domains) {
    for (const m of d.modules) {
      controllers += m.controllers.length;
      services += m.services.length;
      for (const c of m.controllers) {
        apis += c.apis.length;
      }
    }
    frontendPages += d.frontend.length;
  }

  return { domains: doc.domains.length, controllers, apis, services, frontendPages };
}
