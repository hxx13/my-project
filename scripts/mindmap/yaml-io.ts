import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { MindmapDocument } from './types.js';

const SCANNER_VERSION = '0.1.0';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const YAML_PATH = path.join(import.meta.dirname, 'mindmap.yaml');

// ---- Read ----
export function readMindmapYaml(): MindmapDocument | null {
  if (!fs.existsSync(YAML_PATH)) return null;
  const raw = fs.readFileSync(YAML_PATH, 'utf-8');
  const doc = yaml.load(raw) as MindmapDocument;
  return doc;
}

// ---- Write ----
export function writeMindmapYaml(doc: MindmapDocument): void {
  const header = [
    '# ============================================================',
    '# TwinSystem Mindmap — 网站业务逻辑全景导图',
    '#',
    '# 自动生成于: ' + doc.meta.generated,
    '# Scanner 版本: ' + doc.meta.scanner_version,
    '#',
    '# ⚠ 人工标注区域（Scanner 绝不触碰）：',
    '#   - domains[].name / summary / description',
    '#   - domains[].business_rules / business_actors',
    '#   - domains[].data_flows',
    '#   - domains[].pending',
    '#   - cross_cutting（整个区块）',
    '#   - annotations（整个区块）',
    '#',
    '# 自动区域（Scanner 会更新）：',
    '#   - domains[].modules[]',
    '#   - domains[].frontend[]',
    '#   - domains[].interactions[]（仅 source=auto 的条目）',
    '# ============================================================',
    '',
  ].join('\n');

  const content = yaml.dump(doc, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });

  fs.writeFileSync(YAML_PATH, header + content, 'utf-8');
}

// ---- Create empty document skeleton ----
export function createEmptyDocument(): MindmapDocument {
  return {
    meta: {
      version: '1.0',
      generated: new Date().toISOString(),
      project: 'TwinSystem',
      scanner_version: SCANNER_VERSION,
    },
    domains: [],
    cross_cutting: [],
    annotations: {
      architecture_notes: '',
      tech_debt: [],
      glossary: [],
    },
  };
}

// ---- Update timestamp ----
export function updateTimestamp(doc: MindmapDocument): void {
  doc.meta.generated = new Date().toISOString();
  doc.meta.scanner_version = SCANNER_VERSION;
}

// ---- Ensure output directory exists under docs/mindmap/ ----
export function ensureOutputDir(subpath: string): string {
  const dir = path.join(PROJECT_ROOT, 'docs', 'mindmap', subpath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---- Read source file content ----
export function readSourceFile(relativePath: string): string | null {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}
