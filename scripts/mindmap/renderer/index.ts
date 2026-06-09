import type { MindmapDocument } from '../types.js';
import { renderMermaid } from './mermaid-renderer.js';
import { renderXMind } from './xmind-renderer.js';
import { renderMarkmap } from './markmap-renderer.js';

export async function renderAll(doc: MindmapDocument): Promise<void> {
  console.log('\n📄 Rendering outputs...\n');

  console.log('  Mermaid → docs/mindmap/mermaid/');
  renderMermaid(doc);

  console.log('  XMind → docs/mindmap/mindmap.xmind');
  await renderXMind(doc);

  console.log('  Markmap → docs/mindmap/mindmap.html');
  renderMarkmap(doc);

  console.log('\n✅ All outputs rendered.\n');
}
