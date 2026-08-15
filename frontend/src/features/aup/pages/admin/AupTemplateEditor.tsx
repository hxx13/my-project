import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  fetchAupDefaultSeed,
  fetchAupDicts,
  fetchAupTemplateById,
  publishAupTemplate,
  updateAupTemplate,
  type UpdateTemplateBody,
} from "@/features/aup/api/aup.api";
import type {
  ChoiceType,
  FieldConfig,
  FieldType,
  OptionItem,
  ShowWhen,
  ShowWhenOp,
  FormField as FormFieldDef,
  FormSection,
  FormSubSection,
} from "@/features/aup/schema/formTemplate";
import FormField, { evaluateShowWhen, normalizeOptions } from "@/features/aup/components/FormField";
import ScrollButtons from "@/features/aup/components/ScrollButtons";
import { FIELD_TEMPLATES, type FieldTemplate } from "@/features/aup/schema/fieldTemplates";
import "../../aup.css";

/* =====================================================================
 * C1 表单直编：中间就是填写人看到的最终表单，点哪改哪。
 *   - 顶栏：模板名 · 版本 · 新建草稿 · 保存 · 发布 ｜ 编辑/预览开关
 *   - 左栏：可搜索目录（编码 = 小徽章），＋新增板块
 *   - 主区：表单本身；题目悬浮出「编辑」，章节头悬浮出操作
 *   - 选项侧展开：选项「开启后显示」→ 选目标，底层写 showWhen
 *   - 字典选择：选项来源 = 手动填写 / 从字典选择（分类 → 字典）
 *   - 字段键 / showWhen / 字典键全部收进「高级设置」
 * 数据模型与 API 签名均不改（UpdateTemplateBody 原样）。
 * ================================================================== */

type FieldPath = { si: number; ui?: number; fi: number };

type StructRef =
  | { kind: "section"; si: number }
  | { kind: "subsection"; si: number; ui: number };

type TargetNode =
  | { kind: "section"; si: number; code: string; label: string }
  | { kind: "subsection"; si: number; ui: number; code: string; label: string }
  | { kind: "field"; si: number; ui?: number; fi: number; code: string; label: string };

function targetKey(t: TargetNode): string {
  return t.kind === "section"
    ? `s:${t.si}`
    : t.kind === "subsection"
      ? `u:${t.si}:${t.ui}`
      : `f:${t.si}:${t.ui ?? "-"}:${t.fi}`;
}

function targetLabel(t: TargetNode): string {
  const kind = t.kind === "section" ? "板块" : t.kind === "subsection" ? "小节" : "题目";
  const text = [t.code, t.label].filter(Boolean).join(" · ");
  return `${kind} ${text}`.trim();
}

/* ---- 工具 ---- */
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function nextSectionCode(existing: string[]): string {
  const used = new Set(existing.map((c) => c.toUpperCase()));
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  let n = 26;
  while (true) {
    let x = n;
    let s = "";
    do {
      s = String.fromCharCode(65 + (x % 26)) + s;
      x = Math.floor(x / 26) - 1;
    } while (x >= 0);
    if (!used.has(s)) return s;
    n++;
  }
}

function nextSubsectionNumber(codes: string[], sectionCode: string): number {
  const nums = codes
    .map((c) => {
      if (c.toUpperCase().startsWith(sectionCode.toUpperCase())) {
        const n = parseInt(c.slice(sectionCode.length), 10);
        return isNaN(n) ? -1 : n;
      }
      return -1;
    })
    .filter((n) => n > 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function slugify(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function nextFieldKey(parentCode: string, existing: string[], label?: string): string {
  const base = parentCode + ".";
  const used = new Set(existing);
  const slug = slugify(label ?? "");
  if (slug) {
    const cand = base + slug;
    if (!used.has(cand)) return cand;
    let i = 2;
    while (used.has(`${cand}${i}`)) i++;
    return `${cand}${i}`;
  }
  let i = 1;
  while (used.has(`${base}field${i}`)) i++;
  return `${base}field${i}`;
}

function collectFieldKeys(sec: FormSection): string[] {
  const keys = (sec.fields ?? []).map((f) => f.fieldKey);
  (sec.subsections ?? []).forEach((u) => u.fields.forEach((f) => keys.push(f.fieldKey)));
  return keys;
}

function collectAllFields(tree: FormSection[]): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  tree.forEach((s) => {
    (s.fields ?? []).forEach((f) => out.push({ key: f.fieldKey, label: f.label }));
    (s.subsections ?? []).forEach((u) => u.fields.forEach((f) => out.push({ key: f.fieldKey, label: f.label })));
  });
  return out;
}

function collectTargets(tree: FormSection[]): TargetNode[] {
  const out: TargetNode[] = [];
  tree.forEach((s, si) => {
    out.push({ kind: "section", si, code: s.code, label: s.label });
    (s.subsections ?? []).forEach((u, ui) => {
      out.push({ kind: "subsection", si, ui, code: u.code, label: u.label });
      u.fields.forEach((f, fi) => out.push({ kind: "field", si, ui, fi, code: u.code, label: f.label }));
    });
    (s.fields ?? []).forEach((f, fi) => out.push({ kind: "field", si, fi, code: s.code, label: f.label }));
  });
  return out;
}

/**
 * 选项侧展开索引：key = `${fieldKey};;${optionValue}` → 该选项「开启后显示」的目标节点。
 * 数据源是各节点自身的 showWhen（同一份数据，两种入口）。
 */
function buildRevealMap(tree: FormSection[]): Map<string, TargetNode[]> {
  const m = new Map<string, TargetNode[]>();
  const add = (node: TargetNode, sw: ShowWhen | null | undefined) => {
    if (!sw || !sw.field || sw.value == null) return;
    const key = `${sw.field};;${String(sw.value)}`;
    const arr = m.get(key) ?? [];
    arr.push(node);
    m.set(key, arr);
  };
  tree.forEach((s, si) => {
    add({ kind: "section", si, code: s.code, label: s.label }, s.showWhen);
    (s.subsections ?? []).forEach((u, ui) => {
      add({ kind: "subsection", si, ui, code: u.code, label: u.label }, u.showWhen);
      u.fields.forEach((f, fi) => add({ kind: "field", si, ui, fi, code: u.code, label: f.label }, f.showWhen));
    });
    (s.fields ?? []).forEach((f, fi) => add({ kind: "field", si, fi, code: s.code, label: f.label }, f.showWhen));
  });
  return m;
}

/** 条件显示 → 人话描述（用于目标节点上的横幅） */
function describeShowWhen(sw: ShowWhen, fieldOptions: { key: string; label: string }[]): string {
  const field = fieldOptions.find((o) => o.key === sw.field);
  const fieldLabel = field?.label || sw.field;
  const v = String(sw.value ?? "");
  switch (sw.op) {
    case "equals":
      return `当「${fieldLabel}」为「${v}」时显示`;
    case "notEquals":
      return `当「${fieldLabel}」不为「${v}」时显示`;
    case "contains":
      return `当「${fieldLabel}」选择「${v}」时显示`;
    case "notContains":
      return `当「${fieldLabel}」未选择「${v}」时显示`;
    case "notEmpty":
      return `当「${fieldLabel}」已填写时显示`;
    case "empty":
      return `当「${fieldLabel}」未填写时显示`;
    default:
      return "";
  }
}

/** 编辑态渲染时剥掉 showWhen（保证条件板块/题目在编辑器里始终可见） */
function stripShowWhenDeep(f: FormFieldDef): FormFieldDef {
  const out: FormFieldDef = { ...f, showWhen: null };
  const cfg = f.config;
  if (cfg) {
    const next: FieldConfig = { ...cfg };
    if (cfg.fields) next.fields = cfg.fields.map(stripShowWhenDeep);
    if (cfg.columns) next.columns = cfg.columns.map(stripShowWhenDeep);
    out.config = next;
  }
  return out;
}

function nextChildKey(parentKey: string, existing: string[]): string {
  const base = parentKey + ".";
  const used = new Set(existing);
  let i = 1;
  while (used.has(`${base}c${i}`)) i++;
  return `${base}c${i}`;
}

const statusLabel = (s: string) => (s === "DRAFT" ? "草稿" : s === "PUBLISHED" ? "已发布" : "已归档");

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "输入框" },
  { value: "textarea", label: "多行输入框" },
  { value: "number", label: "数字输入框" },
  { value: "date", label: "日期选择" },
  { value: "dateRange", label: "日期区间" },
  { value: "time", label: "时间选择" },
  { value: "choice", label: "选择题" },
  { value: "checkbox", label: "是否勾选" },
  { value: "cascade", label: "级联选择" },
  { value: "table", label: "表格" },
  { value: "group", label: "字段组" },
  { value: "file", label: "附件上传" },
  { value: "image", label: "图片上传" },
  { value: "personPicker", label: "人员选择" },
  { value: "departmentPicker", label: "部门选择" },
  { value: "cagePicker", label: "笼位选择" },
  { value: "animalPicker", label: "动物选择" },
  { value: "signature", label: "签名" },
  { value: "richText", label: "富文本" },
  { value: "divider", label: "分隔线" },
  { value: "description", label: "说明文字" },
];

const TYPE_ICONS: Record<FieldType, string> = {
  text: "文",
  textarea: "多",
  number: "数",
  date: "日",
  dateRange: "区",
  time: "时",
  choice: "选",
  checkbox: "勾",
  cascade: "级",
  table: "表",
  group: "组",
  file: "附",
  image: "图",
  personPicker: "人",
  departmentPicker: "部",
  cagePicker: "笼",
  animalPicker: "动",
  signature: "签",
  richText: "富",
  divider: "分",
  description: "说",
};

const typeLabelOf = (t: FieldType) => FIELD_TYPES.find((x) => x.value === t)?.label ?? t;

const CSS = `
.aup{--p:#002FA7;--pw:#EEF2FF;--s:#15803D;--sw:#E8F7EE;--w:#B45309;--ww:#FEF3C7;--d:#DC2626;--dw:#FDEAEA;
  --bg:#F4F5F7;--card:#FFFFFF;--bd:#E5E7EB;--tx:#111827;--mu:#6B7280;--sl:#9CA3AF;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--tx);font-size:14px;line-height:1.6;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg);overflow:hidden}
.aup *{box-sizing:border-box}
.aup button{font-family:inherit}
.aup .aup-btn{display:inline-flex;align-items:center;gap:4px;padding:7px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent;transition:.15s;white-space:nowrap;background:#fff;color:var(--tx)}
.aup .aup-btn:disabled{opacity:.45;cursor:not-allowed}
.aup .aup-btn.ghost{background:#fff;border-color:#d5dbe3;color:var(--tx)}
.aup .aup-btn.ghost:hover:not(:disabled){border-color:var(--mu)}
.aup .aup-btn.primary{background:var(--p);color:#fff}
.aup .aup-btn.primary:hover:not(:disabled){background:#3150c7}
.aup .aup-btn.danger{background:#fff;border-color:var(--d);color:var(--d)}
.aup .aup-btn.danger:hover:not(:disabled){background:var(--dw)}
.aup .aup-btn.small{padding:3px 9px;font-size:12px;border-radius:6px}
.aup .aup-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--mu);cursor:pointer;font-size:13px;line-height:1}
.aup .aup-iconbtn:hover:not(:disabled){background:#eef1f4;color:var(--tx)}
.aup .aup-iconbtn:disabled{opacity:.4;cursor:not-allowed}
.aup .aup-iconbtn.danger:hover:not(:disabled){background:var(--dw);color:var(--d)}
.aup .aup-tag{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.aup .aup-tag.draft{background:var(--ww);color:var(--w)}
.aup .aup-tag.published{background:var(--sw);color:var(--s)}
.aup .aup-tag.archived{background:#eceff3;color:var(--sl)}
.aup .aup-input,.aup .aup-select,.aup .aup-textarea{width:100%;padding:8px 12px;border:1px solid #d5dbe3;border-radius:6px;font-size:13px;font-family:inherit;background:#fff;color:var(--tx);outline:none}
.aup .aup-input:focus,.aup .aup-select:focus,.aup .aup-textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px var(--pw)}
.aup .aup-input:disabled,.aup .aup-select:disabled,.aup .aup-textarea:disabled{background:#f6f8fa;color:var(--sl);cursor:not-allowed}
.aup .aup-textarea{min-height:72px;resize:vertical}
.aup .aup-muted{color:var(--mu);font-size:12px}
.aup .aup-h{font-size:14px;font-weight:700;margin-bottom:12px}
.aup .aup-subh{font-size:13px;font-weight:600;margin:2px 0 8px}
.aup .aup-empty{padding:40px;text-align:center;color:var(--mu);font-size:13px}
.aup .aup-empty.small{padding:20px}
.aup .aup-row{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.aup .aup-row>label{font-size:13px;color:var(--mu);width:88px;flex-shrink:0;padding-top:8px}
.aup .aup-row .aup-input,.aup .aup-row .aup-select,.aup .aup-row .aup-textarea{flex:1}
.aup .aup-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.aup .aup-check{display:flex;align-items:center;gap:6px;font-size:13px;padding-top:8px;cursor:pointer}
.aup .aup-divider{height:1px;background:var(--bd);margin:10px 0}
.aup .aup-hint{font-size:12px;color:var(--mu);line-height:1.6}
.aup .aup-actions{display:flex;gap:8px;flex-wrap:wrap}

/* ===== 顶栏 ===== */
.aup .aup-topbar{display:flex;align-items:center;gap:10px;padding:12px 20px;background:#fff;border-bottom:1px solid var(--bd);flex-wrap:wrap}
.aup .aup-desc-bar{display:flex;align-items:flex-start;gap:10px;padding:10px 20px;background:#fff;border-bottom:1px solid var(--bd)}
.aup .aup-desc-bar-label{font-size:13px;font-weight:600;color:var(--tx);padding-top:8px;flex-shrink:0}
.aup .aup-desc-bar-input{flex:1;resize:vertical;min-height:44px;font-family:inherit;line-height:1.5}
.aup .aup-title{font-size:15px;font-weight:700}
.aup .aup-spacer{flex:1}
.aup .aup-mode-toggle{display:inline-flex;border:1px solid #d5dbe3;border-radius:6px;overflow:hidden;background:#fff}
.aup .aup-mode-toggle button{padding:6px 16px;font-size:13px;font-weight:600;border:none;background:transparent;cursor:pointer;color:var(--mu)}
.aup .aup-mode-toggle button.active{background:var(--pw);color:var(--p)}
.aup .aup-mode-toggle button:disabled{cursor:not-allowed;opacity:.5}

/* ===== 左栏目录 ===== */
.aup .aup-split{flex:1;min-height:0;display:flex;width:100%;overflow:hidden}
.aup .aup-toc{width:248px;flex-shrink:0;background:#fff;border-right:1px solid var(--bd);display:flex;flex-direction:column;min-height:0}
.aup .aup-toc .hd{padding:12px 14px;font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center}
.aup .aup-toc .search{padding:10px 12px 4px}
.aup .aup-toc .body{overflow-y:auto;padding:8px 8px 12px;flex:1}
.aup .aup-toc-item{padding:7px 8px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:7px;margin-bottom:1px;font-size:13px;color:var(--tx)}
.aup .aup-toc-item:hover{background:#f6f7f9}
.aup .aup-toc-item.sub{padding-left:26px;font-size:12.5px;color:#374151}
.aup .aup-code-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:20px;padding:0 5px;border-radius:5px;background:var(--p);color:#fff;font-size:11px;font-weight:700;flex-shrink:0}
.aup .aup-toc-item.sub .aup-code-badge{background:#eef1f4;color:var(--mu)}
.aup .aup-toc-item .lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aup .aup-toc-item .cond-tag{color:var(--w);font-size:11px;flex-shrink:0}
.aup .aup-toc-foot{padding:8px 12px 14px;border-top:1px solid var(--bd)}
.aup .aup-toc-foot .aup-btn{width:100%;justify-content:center}

/* ===== 主区 ===== */
.aup .aup-main{flex:1;min-width:0;overflow-y:auto;min-height:0;padding:16px 20px 40px;background:var(--bg)}
.aup .aup-ed-card{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:16px 20px;margin-bottom:18px;scroll-margin-top:14px}
.aup .aup-sec-hd{display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid #eef0f3;margin-bottom:4px;flex-wrap:wrap}
.aup .aup-sec-title{font-size:15px;font-weight:700;flex:1;min-width:120px}
.aup .aup-sec-acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.aup .aup-sub-hd{display:flex;align-items:center;gap:8px;margin:14px 0 4px;font-size:14px;font-weight:700;color:#1f2937}
.aup .aup-sub-code{color:var(--p);font-weight:700;flex-shrink:0}
.aup .aup-sub-desc{font-size:12px;color:var(--mu);margin:-2px 0 8px}
.aup .aup-sec-acts .aup-hint-link{color:var(--mu)}

/* 条件横幅（写在目标上，人话） */
.aup .aup-cond-banner{display:flex;align-items:center;gap:8px;border:1px dashed #b45309;background:var(--ww);border-radius:6px;padding:6px 12px;font-size:12px;color:#7c4a03;margin:8px 0}
.aup .aup-cond-banner .aup-btn{color:#7c4a03;border-color:#b45309;padding:1px 8px;font-size:11px}
.aup .aup-cond-banner.small{margin:6px 0 0}

/* 题目容器：悬浮出操作 */
.aup .aup-fw{position:relative;border-radius:8px;margin:0 -6px;padding:6px 6px 2px}
.aup .aup-fw:hover{background:#f7f8fb;box-shadow:inset 0 0 0 1px #e7eaf0}
.aup .aup-fw-acts{display:none;position:absolute;top:8px;right:8px;gap:4px;align-items:center;background:#fff;border:1px solid #e2e6ec;border-radius:8px;padding:2px;box-shadow:0 2px 8px rgba(16,24,40,.12);z-index:5}
.aup .aup-fw:hover .aup-fw-acts{display:inline-flex}
.aup .aup-fw .aup-btn{font-size:12px}

/* ＋ 添加题目 */
.aup .aup-add-row{margin-top:10px;padding-top:8px;border-top:1px dashed #d5dbe3}
.aup .aup-add-link{color:var(--p);font-size:13px;cursor:pointer;background:none;border:none;padding:2px 4px}
.aup .aup-add-link:hover{text-decoration:underline}
.aup .aup-type-menu{border:1px solid var(--bd);border-radius:10px;background:#fff;padding:12px;box-shadow:0 8px 28px rgba(16,24,40,.14);max-height:min(620px,78vh);overflow-y:auto}
.aup .aup-type-menu-hd{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:10px}
.aup .aup-type-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.aup .aup-type-grid button{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #e2e6ec;border-radius:8px;background:#fff;cursor:pointer;font-size:12.5px;text-align:left}
.aup .aup-type-grid button:hover{border-color:var(--p);background:var(--pw)}
.aup .aup-type-ic{width:22px;height:22px;border-radius:6px;background:var(--pw);color:var(--p);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.aup .aup-type-tpl-hd{display:flex;align-items:center;gap:6px;margin:12px 0 2px;font-size:12px;font-weight:700;color:var(--mu)}
.aup .aup-type-tpl-hd::before{content:"";flex:1;height:1px;background:var(--bd)}
.aup .aup-type-grid.tpl button{flex-direction:column;align-items:flex-start;gap:3px;padding:8px 10px}
.aup .aup-type-grid.tpl button .tpl-name{display:flex;align-items:center;gap:8px;font-weight:600;width:100%}
.aup .aup-type-grid.tpl button .tpl-name .cnt{margin-left:auto;font-size:11px;font-weight:600;color:var(--mu);background:#f1f3f6;border-radius:10px;padding:0 7px}
.aup .aup-type-grid.tpl button .tpl-desc{font-size:11px;color:var(--mu);line-height:1.4}

/* ===== 行内字段编辑器 ===== */
.aup .aup-field-editor{padding:14px 16px;margin:6px 0;background:#fbfcfe;border:1px solid #d5dbe3;border-left:3px solid var(--p);border-radius:8px}
.aup .aup-field-editor-hd{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.aup .aup-field-editor-title{font-size:14px;font-weight:700;flex:1;min-width:120px}
.aup .aup-field-editor-title .aup-type-ic{vertical-align:-4px;margin-right:6px}
.aup .aup-opt-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.aup .aup-opt-row .aup-input{flex:1}
.aup .aup-opt-fixed{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--warn);white-space:nowrap;cursor:pointer;flex-shrink:0}
.aup .aup-opt-fixed input{margin:0}
.aup .aup-expand-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;font-size:11px;cursor:pointer;border:none;white-space:nowrap;flex-shrink:0}
.aup .aup-expand-pill.on{background:var(--pw);color:var(--p)}
.aup .aup-expand-pill.off{background:#f1f3f6;color:var(--mu)}
.aup .aup-expand-panel{border:1px dashed #cbd5e1;background:#fafbff;border-radius:8px;padding:10px;margin:0 0 8px 8px}
.aup .aup-expand-panel .lbl{font-size:11px;color:#555;margin-bottom:6px}
.aup .aup-reveal-chip{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e2e4e8;border-radius:6px;padding:5px 8px;margin-bottom:5px;font-size:12px}
.aup .aup-reveal-chip .kind{background:#6b7280;color:#fff;border-radius:4px;font-size:10px;padding:0 5px;flex-shrink:0}
.aup .aup-reveal-chip .x{margin-left:auto;color:#888;cursor:pointer;border:none;background:none;font-size:12px}
.aup .aup-reveal-chip .x:hover{color:var(--d)}
.aup .aup-add-reveal{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--p);cursor:pointer;border:1px dashed #cbd5e1;border-radius:6px;padding:5px 8px;background:#fff}
.aup .aup-add-reveal .aup-select{border:none;background:transparent;font-size:12px;color:var(--p);flex:1;padding:0}
.aup .aup-adv{border-top:1px dashed var(--bd);margin-top:12px;padding-top:10px}
.aup .aup-adv summary{cursor:pointer;font-size:13px;color:var(--sl);font-weight:600;user-select:none;list-style:none}
.aup .aup-adv summary::before{content:"▸ ";color:var(--sl)}
.aup .aup-adv[open] summary::before{content:"▾ "}
.aup .aup-adv summary:hover{color:var(--p)}
.aup .aup-adv[open] summary{margin-bottom:10px}

/* 结构（板块/小节）内联编辑 */
.aup .aup-struct-editor{padding:12px 14px;margin:8px 0;background:#fbfcfe;border:1px solid var(--bd);border-radius:8px}
.aup .aup-struct-editor .aup-subh{margin-top:0}

/* 预览提示 */
.aup .aup-preview-hint{display:flex;align-items:center;gap:8px;background:var(--pw);border:1px solid #c7d6ff;color:#2c4bb0;border-radius:8px;padding:8px 14px;font-size:12.5px;margin-bottom:14px}
.aup .aup-form-app{min-height:0;background:transparent;padding:0}

/* 顶栏分组：名称/描述输入区 */
.aup .aup-topbar{gap:8px}
.aup .aup-top-name{width:200px}
.aup .aup-top-desc{width:320px}
.aup .aup-top-desc-textarea{resize:vertical;min-height:64px;font-family:inherit;line-height:1.5}
.aup .aup-topbar .aup-btn{white-space:nowrap}

/* 版本面板（左栏顶部） */
.aup .aup-ver{padding:8px 8px 6px;border-bottom:1px solid var(--bd)}
.aup .aup-ver-hd{display:flex;align-items:center;justify-content:space-between;padding:2px 4px 6px;font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.06em}
.aup .aup-ver-item{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12.5px;margin-bottom:1px;border:1px solid transparent}
.aup .aup-ver-item:hover{background:#f6f7f9}
.aup .aup-ver-item.active{background:var(--pw);border-color:#c7d6ff;color:var(--p)}
.aup .aup-ver-item .lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx)}
.aup .aup-ver-item.active .lbl{color:var(--p);font-weight:600}
.aup .aup-ver-item .aup-iconbtn{width:20px;height:20px;font-size:11px}

/* 空状态引导 */
.aup .aup-empty-hero{text-align:center;padding:46px 20px}
.aup .aup-empty-hero .ic{font-size:34px;margin-bottom:10px}
.aup .aup-empty-hero .t{font-size:16px;font-weight:700;margin-bottom:8px}
.aup .aup-empty-hero .d{font-size:13px;color:var(--mu);margin-bottom:18px;line-height:1.7;max-width:520px;margin-left:auto;margin-right:auto}
.aup .aup-empty-hero .acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}

/* 字段编辑弹窗（居中模态框） */
.aup .aup-drawer-mask{position:fixed;inset:0;background:rgba(17,24,39,.4);z-index:80;display:flex;justify-content:center;align-items:flex-start;padding:6vh 16px 16px;overflow-y:auto}
.aup .aup-drawer{width:640px;max-width:100%;max-height:88vh;background:#fff;border-radius:12px;box-shadow:0 18px 48px rgba(16,24,40,.2);display:flex;flex-direction:column;overflow:hidden}
.aup .aup-drawer-hd{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--bd);flex-shrink:0}
.aup .aup-drawer-title{font-size:14px;font-weight:700;flex:1;display:flex;align-items:center;gap:8px}
.aup .aup-drawer-body{flex:1;overflow-y:auto;padding:14px 18px 40px;min-height:0}
.aup .aup-drawer-body .aup-field-editor{background:transparent;border:none;border-left:none;padding:0;margin:0}
.aup .aup-drawer-hint{font-size:12px;color:var(--mu);background:#f6f7f9;border-radius:6px;padding:6px 10px;margin-bottom:12px}
`;

/* =====================================================================
 * 条件显示编辑器（作用在 section / subsection / field 三层；收进「高级设置」）
 * ================================================================== */
function ShowWhenEditor({
  value,
  onChange,
  fieldOptions,
}: {
  value: ShowWhen | null | undefined;
  onChange: (v: ShowWhen | null) => void;
  fieldOptions?: { key: string; label: string }[];
}) {
  const showWhen: ShowWhen | null = value ?? null;
  const op = showWhen?.op ?? "";
  const needValue = op === "equals" || op === "notEquals" || op === "contains" || op === "notContains";
  const options = fieldOptions ?? [];
  return (
    <div>
      <div className="aup-row">
        <label>显示条件</label>
        <select
          className="aup-select"
          value={op}
          onChange={(e) => {
            const o = e.target.value;
            if (!o) {
              onChange(null);
              return;
            }
            const next: ShowWhen = {
              field: showWhen?.field ?? "",
              op: o as ShowWhenOp,
              value: o === "notEmpty" || o === "empty" ? undefined : showWhen?.value,
            };
            onChange(next);
          }}
        >
          <option value="">无（始终显示）</option>
          <option value="equals">当某字段 = 某值时显示</option>
          <option value="notEquals">当某字段 ≠ 某值时显示</option>
          <option value="contains">当某字段包含某值时显示</option>
          <option value="notContains">当某字段不含某值时显示</option>
          <option value="notEmpty">当某字段非空时显示</option>
          <option value="empty">当某字段为空时显示</option>
        </select>
      </div>
      {showWhen && (
        <>
          <div className="aup-row">
            <label>依赖字段</label>
            <select
              className="aup-select"
              value={showWhen.field}
              onChange={(e) => onChange({ ...showWhen, field: e.target.value })}
            >
              <option value="">选择字段…</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.key}
                  {o.label ? ` · ${o.label}` : ""}
                </option>
              ))}
              {showWhen.field && !options.some((o) => o.key === showWhen.field) && (
                <option value={showWhen.field}>{showWhen.field}（手动）</option>
              )}
            </select>
          </div>
          {needValue && (
            <div className="aup-row">
              <label>比较值</label>
              <input
                className="aup-input"
                value={String(showWhen.value ?? "")}
                onChange={(e) => onChange({ ...showWhen, value: e.target.value })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* =====================================================================
 * 题型选择菜单（＋ 添加题目）
 * ================================================================== */
function TypeMenu({
  onPick,
  onPickTemplate,
  onClose,
}: {
  onPick: (t: FieldType) => void;
  onPickTemplate: (t: FieldTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="aup-type-menu">
      <div className="aup-type-menu-hd">
        <span>选择题目类型</span>
        <button className="aup-iconbtn" onClick={onClose} title="关闭">×</button>
      </div>
      <div className="aup-type-grid">
        {FIELD_TYPES.map((t) => (
          <button key={t.value} onClick={() => onPick(t.value)}>
            <span className="aup-type-ic">{TYPE_ICONS[t.value]}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="aup-type-tpl-hd">复合模板（一键插入整组题目）</div>
      <div className="aup-type-grid tpl">
        {FIELD_TEMPLATES.map((t) => (
          <button key={t.key} onClick={() => onPickTemplate(t)} title={t.desc}>
            <span className="tpl-name">
              <span className="aup-type-ic">{t.icon}</span>
              <span>{t.label}</span>
              <span className="cnt">{t.count} 项</span>
            </span>
            <span className="tpl-desc">{t.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
 * 选项编辑器（choice/checkbox）—— 一行一个中文词 + 选项侧展开
 * value 与 label 同步为输入的文本；选项文本改动时自动重写关联目标的 showWhen。
 * ================================================================== */
function OptionsEditor({
  options,
  onChangeOptions,
  onChangeOptionText,
  fieldKey,
  choiceType,
  targets,
  revealMap,
  onApplyExpand,
  onClearExpand,
  editable,
}: {
  options: OptionItem[];
  onChangeOptions: (o: OptionItem[]) => void;
  onChangeOptionText: (i: number, text: string) => void;
  fieldKey: string;
  choiceType: ChoiceType;
  targets: TargetNode[];
  revealMap: Map<string, TargetNode[]>;
  onApplyExpand: (optionValue: string, target: TargetNode) => void;
  onClearExpand: (target: TargetNode) => void;
  editable: boolean;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const revealedFor = (value: string) => revealMap.get(`${fieldKey};;${value}`) ?? [];

  return (
    <div>
      {options.map((o, i) => {
        const revealed = revealedFor(o.value);
        const open = openIdx === i;
        const pickable = targets.filter((t) => !revealed.some((r) => targetKey(r) === targetKey(t)));
        return (
          <div key={i}>
            <div className="aup-opt-row">
              <input
                className="aup-input"
                placeholder="输入选项文字，如 国家专项"
                value={o.label}
                disabled={!editable}
                onChange={(e) => onChangeOptionText(i, e.target.value)}
              />
              <button
                className={`aup-expand-pill ${revealed.length > 0 ? "on" : "off"}`}
                disabled={!editable}
                onClick={() => setOpenIdx(open ? null : i)}
                title="选中此选项后，可显示指定的板块/小节/题目"
              >
                {revealed.length > 0 ? `开启后显示 ${revealed.length} 项 ▾` : "未开启 · 点此开启"}
              </button>
              <label className="aup-opt-fixed" title="固定选中：默认勾选且不可取消（如 A8 的 K 补充表）">
                <input
                  type="checkbox"
                  checked={!!o.fixed}
                  disabled={!editable}
                  onChange={(e) => onChangeOptions(options.map((x, j) => (j === i ? { ...x, fixed: e.target.checked } : x)))}
                />
                <span>固定</span>
              </label>
              <button className="aup-iconbtn" title="上移" disabled={!editable} onClick={() => onChangeOptions(move(options, i, -1))}>↑</button>
              <button className="aup-iconbtn" title="下移" disabled={!editable} onClick={() => onChangeOptions(move(options, i, 1))}>↓</button>
              <button className="aup-iconbtn danger" title="删除" disabled={!editable} onClick={() => onChangeOptions(options.filter((_, j) => j !== i))}>×</button>
            </div>
            {open && (
              <div className="aup-expand-panel">
                <div className="lbl">当选择「{o.label || o.value || "…"}」后显示：</div>
                {revealed.length === 0 && <div className="aup-muted" style={{ marginBottom: 6 }}>暂未配置，点下方「＋ 添加」选择要显示的内容。</div>}
                {revealed.map((r) => (
                  <div className="aup-reveal-chip" key={targetKey(r)}>
                    <span className="kind">{r.kind === "section" ? "板块" : r.kind === "subsection" ? "小节" : "题目"}</span>
                    <span>{[r.code, r.label].filter(Boolean).join(" · ")}</span>
                    <button className="x" title="移除" disabled={!editable} onClick={() => onClearExpand(r)}>×</button>
                  </div>
                ))}
                {pickable.length > 0 && (
                  <div className="aup-add-reveal">
                    <span>＋ 添加</span>
                    <select
                      className="aup-select"
                      value=""
                      disabled={!editable}
                      onChange={(e) => {
                        const t = pickable.find((x) => targetKey(x) === e.target.value);
                        if (t) {
                          onApplyExpand(o.value, t);
                          setOpenIdx(null);
                        }
                      }}
                    >
                      <option value="">选择板块 / 小节 / 题目…</option>
                      {pickable.map((t) => (
                        <option key={targetKey(t)} value={targetKey(t)}>
                          {targetLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          className="aup-btn small ghost"
          disabled={!editable}
          onClick={() => onChangeOptions([...options, { value: "", label: "" }])}
        >
          ＋ 选项
        </button>
        <button
          className="aup-btn small ghost"
          disabled={!editable}
          title="一键生成 是/否 两项，可再改文字"
          onClick={() => onChangeOptions([{ value: "是", label: "是" }, { value: "否", label: "否" }])}
        >
          ⚡ 是/否
        </button>
      </div>
    </div>
  );
}

/* =====================================================================
 * 子字段列表（table 的 columns / group 的 fields）
 * ================================================================== */
function ChildFieldList({
  fields,
  onChange,
  editable,
  parentKey,
}: {
  fields: FormFieldDef[];
  onChange: (f: FormFieldDef[]) => void;
  editable: boolean;
  parentKey: string;
}) {
  const addChild = () => {
    const key = nextChildKey(parentKey, fields.map((f) => f.fieldKey));
    onChange([...fields, { fieldKey: key, label: "", type: "text", required: false }]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fields.map((c, i) => {
        const patch = (p: Partial<FormFieldDef>) => {
          const n = [...fields];
          n[i] = { ...n[i], ...p };
          onChange(n);
        };
        return (
          <div key={`${i}-${c.fieldKey}`} style={{ border: "1px dashed #d5dbe3", borderRadius: 8, padding: 8 }}>
            <div className="aup-row" style={{ marginBottom: 0 }}>
              <input
                className="aup-input"
                style={{ width: 140, flex: "0 0 140px" }}
                title="字段键"
                value={c.fieldKey}
                disabled={!editable}
                onChange={(e) => patch({ fieldKey: e.target.value })}
              />
              <input
                className="aup-input"
                placeholder="名称"
                value={c.label}
                disabled={!editable}
                onChange={(e) => patch({ label: e.target.value })}
              />
              <select
                className="aup-select"
                style={{ width: 140, flex: "0 0 140px" }}
                value={c.type}
                disabled={!editable}
                onChange={(e) => patch({ type: e.target.value as FieldType })}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="aup-check" style={{ paddingTop: 0 }}>
                <input
                  type="checkbox"
                  checked={!!c.required}
                  disabled={!editable}
                  onChange={(e) => patch({ required: e.target.checked })}
                />
                必填
              </label>
              <button className="aup-iconbtn" title="上移" disabled={!editable} onClick={() => onChange(move(fields, i, -1))}>↑</button>
              <button className="aup-iconbtn" title="下移" disabled={!editable} onClick={() => onChange(move(fields, i, 1))}>↓</button>
              <button className="aup-iconbtn danger" title="删除" disabled={!editable} onClick={() => onChange(fields.filter((_, j) => j !== i))}>×</button>
            </div>
            {c.type === "number" && (
              <div className="aup-row" style={{ margin: "8px 0 0", alignItems: "center" }}>
                <label>单位</label>
                <input
                  className="aup-input"
                  value={String(c.config?.unit ?? "")}
                  disabled={!editable}
                  onChange={(e) => patch({ config: { ...c.config, unit: e.target.value } })}
                />
              </div>
            )}
            {(c.type === "table" || c.type === "group") && (
              <div className="aup-hint">暂不支持嵌套 table/group，请改用基础类型。</div>
            )}
          </div>
        );
      })}
      <button className="aup-btn small ghost" disabled={!editable} onClick={addChild}>
        ＋ 添加
      </button>
    </div>
  );
}

/* =====================================================================
 * 题目行内编辑器（无抽屉、无弹窗；选项侧展开 + 字典选择 + 高级设置）
 * ================================================================== */
function FieldEditorInline({
  field,
  patch,
  editable,
  fieldOptions,
  targets,
  revealMap,
  onChangeOptionText,
  onApplyExpand,
  onClearExpand,
  onClose,
}: {
  field: FormFieldDef;
  patch: (p: Partial<FormFieldDef>) => void;
  editable: boolean;
  fieldOptions: { key: string; label: string }[];
  targets: TargetNode[];
  revealMap: Map<string, TargetNode[]>;
  onChangeOptionText: (i: number, text: string) => void;
  onApplyExpand: (optionValue: string, target: TargetNode) => void;
  onClearExpand: (target: TargetNode) => void;
  onClose: () => void;
}) {
  const cfg: FieldConfig = field.config ?? {};
  const options = normalizeOptions(field.options);
  const useDict = !!field.dictKey;
  const setCfg = (p: Partial<FieldConfig>) => patch({ config: { ...cfg, ...p } });
  const multiple = field.type === "choice" && cfg.choiceType === "multiple";

  /* 字典选择：分类 → 字典 */
  const dictsQuery = useQuery({ queryKey: ["aup", "dicts", "all"], queryFn: () => fetchAupDicts({ size: 500 }) });
  const dicts = dictsQuery.data?.items ?? [];
  const currentDict = dicts.find((d) => d.dictKey === field.dictKey);
  const categories = useMemo(
    () => Array.from(new Set(dicts.map((d) => d.category || "未分类"))).sort(),
    [dicts]
  );
  const [selCat, setSelCat] = useState<string>(currentDict?.category ?? "");
  const [selDict, setSelDict] = useState<string>(field.dictKey ?? "");
  const dictsInCat = selCat
    ? dicts.filter((d) => (d.category || "未分类") === selCat)
    : dicts;

  const renderTypeConfig = () => {
    const t = field.type;

    if (t === "choice" || t === "checkbox") {
      return (
        <>
          <div className="aup-divider" />
          <div className="aup-subh">选项</div>
          <div className="aup-row" style={{ alignItems: "center" }}>
            <label>选项来源</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={`aup-btn small ${useDict ? "ghost" : ""}`}
                style={useDict ? undefined : { background: "var(--pw)", color: "var(--p)", borderColor: "var(--p)" }}
                disabled={!editable}
                onClick={() => {
                  patch({ dictKey: undefined, options: options.length ? options : [{ value: "", label: "" }] });
                  setSelDict("");
                }}
              >
                手动填写
              </button>
              <button
                type="button"
                className={`aup-btn small ${!useDict ? "ghost" : ""}`}
                style={!useDict ? undefined : { background: "var(--pw)", color: "var(--p)", borderColor: "var(--p)" }}
                disabled={!editable}
                onClick={() => {
                  patch({ dictKey: "", options: undefined });
                  setSelCat(currentDict?.category ?? "");
                  setSelDict(field.dictKey ?? "");
                }}
              >
                从字典选择
              </button>
            </div>
          </div>
          {useDict ? (
            <>
              <div className="aup-row">
                <label>分类</label>
                <select
                  className="aup-select"
                  value={selCat}
                  disabled={!editable}
                  onChange={(e) => {
                    setSelCat(e.target.value);
                    setSelDict("");
                    patch({ dictKey: undefined });
                  }}
                >
                  <option value="">选择分类…</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="aup-row">
                <label>字典</label>
                <select
                  className="aup-select"
                  value={selDict}
                  disabled={!editable}
                  onChange={(e) => {
                    const dk = e.target.value;
                    setSelDict(dk);
                    patch({ dictKey: dk || undefined });
                  }}
                >
                  <option value="">选择字典…</option>
                  {dictsInCat.map((d) => (
                    <option key={d.dictKey} value={d.dictKey}>
                      {d.name}
                      {d.itemCount ? `（${d.itemCount} 项）` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="aup-hint">引用后选项来自字典，到 AUP 字典页修改即全局生效。</div>
            </>
          ) : (
            <>
              <OptionsEditor
                options={options}
                onChangeOptions={(o) => patch({ options: o })}
                onChangeOptionText={onChangeOptionText}
                fieldKey={field.fieldKey}
                choiceType={cfg.choiceType ?? "single"}
                targets={targets}
                revealMap={revealMap}
                onApplyExpand={onApplyExpand}
                onClearExpand={onClearExpand}
                editable={editable}
              />
              {t === "choice" && (
                <div className="aup-row" style={{ marginTop: 8, alignItems: "center" }}>
                  <label>选择方式</label>
                  <select
                    className="aup-select"
                    value={String(cfg.choiceType ?? "single")}
                    disabled={!editable}
                    onChange={(e) => setCfg({ choiceType: e.target.value as ChoiceType })}
                  >
                    <option value="single">单选</option>
                    <option value="multiple">多选（可多选并触发补充表）</option>
                  </select>
                </div>
              )}
            </>
          )}
        </>
      );
    }

    if (t === "text" || t === "textarea") {
      return (
        <div className="aup-row" style={{ marginTop: 8 }}>
          <label>字数上限</label>
          <input
            className="aup-input"
            type="number"
            disabled={!editable}
            value={String(cfg.maxLength ?? "")}
            placeholder="留空不限制"
            onChange={(e) => setCfg({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
      );
    }

    if (t === "number") {
      return (
        <>
          <div className="aup-row">
            <label>单位</label>
            <input
              className="aup-input"
              disabled={!editable}
              value={String(cfg.unit ?? "")}
              placeholder="如 只"
              onChange={(e) => setCfg({ unit: e.target.value })}
            />
          </div>
          <div className="aup-row">
            <label>最小值</label>
            <input
              className="aup-input"
              type="number"
              disabled={!editable}
              value={String(cfg.min ?? "")}
              onChange={(e) => setCfg({ min: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div className="aup-row">
            <label>最大值</label>
            <input
              className="aup-input"
              type="number"
              disabled={!editable}
              value={String(cfg.max ?? "")}
              onChange={(e) => setCfg({ max: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        </>
      );
    }

    if (t === "file" || t === "image") {
      return (
        <>
          <div className="aup-row">
            <label>接受类型</label>
            <input
              className="aup-input"
              disabled={!editable}
              value={String(cfg.accept ?? "")}
              placeholder="如 .pdf,.docx"
              onChange={(e) => setCfg({ accept: e.target.value })}
            />
          </div>
          <div className="aup-row">
            <label>大小上限</label>
            <input
              className="aup-input"
              type="number"
              disabled={!editable}
              value={String(cfg.maxSize ?? "")}
              placeholder="字节"
              onChange={(e) => setCfg({ maxSize: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div className="aup-row">
            <label>数量上限</label>
            <input
              className="aup-input"
              type="number"
              disabled={!editable}
              value={String(cfg.maxCount ?? "")}
              onChange={(e) => setCfg({ maxCount: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        </>
      );
    }

    if (t === "table") {
      return (
        <>
          <div className="aup-divider" />
          <div className="aup-subh">列定义</div>
          <ChildFieldList
            fields={cfg.columns ?? []}
            editable={editable}
            parentKey={field.fieldKey}
            onChange={(cols) => setCfg({ columns: cols })}
          />
        </>
      );
    }

    if (t === "group") {
      return (
        <>
          <div className="aup-divider" />
          <div className="aup-subh">子字段</div>
          <ChildFieldList
            fields={cfg.fields ?? []}
            editable={editable}
            parentKey={field.fieldKey}
            onChange={(fs) => setCfg({ fields: fs })}
          />
        </>
      );
    }

    if (t === "cascade") {
      return (
        <div className="aup-row" style={{ marginTop: 8 }}>
          <label>级联层级</label>
          <input
            className="aup-input"
            disabled={!editable}
            value={Array.isArray(cfg.levels) ? cfg.levels.join(",") : ""}
            placeholder="如 校区,楼,房间"
            onChange={(e) =>
              setCfg({
                levels: e.target.value ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
              })
            }
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="aup-field-editor">
      <div className="aup-field-editor-hd">
        <span className="aup-field-editor-title">
          <span className="aup-type-ic">{TYPE_ICONS[field.type] ?? "?"}</span>
          正在编辑：{field.label || "未命名题目"}
        </span>
        <button className="aup-btn small ghost" onClick={onClose}>▴ 收起</button>
      </div>

      <div className="aup-row" style={{ alignItems: "center" }}>
        <label>标题</label>
        <input
          className="aup-input"
          value={field.label}
          disabled={!editable}
          placeholder="如 项目名称"
          onChange={(e) => patch({ label: e.target.value })}
        />
      </div>

      <div className="aup-row" style={{ alignItems: "flex-start" }}>
        <label>说明文字</label>
        <textarea
          className="aup-textarea"
          value={field.description ?? ""}
          disabled={!editable}
          placeholder="题目下方的填写说明（可空；支持富文本 HTML，如 <p>…</p>）"
          onChange={(e) => patch({ description: e.target.value })}
        />
      </div>

      <div className="aup-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <label>题型</label>
        <select
          className="aup-select"
          style={{ width: 180, flex: "0 0 180px" }}
          value={field.type}
          disabled={!editable}
          onChange={(e) => patch({ type: e.target.value as FieldType })}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="aup-check" style={{ paddingTop: 0, display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
          <input
            type="checkbox"
            checked={!!field.required}
            disabled={!editable}
            onChange={(e) => patch({ required: e.target.checked })}
          />
          <span>{field.required ? "必填" : "选填"}</span>
        </label>
      </div>

      {renderTypeConfig()}

      <details className="aup-adv">
        <summary>高级设置</summary>
        <div className="aup-row">
          <label>字段键</label>
          <input
            className="aup-input"
            value={field.fieldKey}
            disabled={!editable}
            placeholder="自动生成"
            onChange={(e) => patch({ fieldKey: e.target.value })}
          />
        </div>
        <div className="aup-hint" style={{ marginBottom: 8 }}>字段键用于条件显示与数据存储，建议保持自动生成值。</div>
        <ShowWhenEditor value={field.showWhen} onChange={(v) => patch({ showWhen: v ?? null })} fieldOptions={fieldOptions} />
      </details>
    </div>
  );
}

/* =====================================================================
 * 板块 / 小节 结构内联编辑器（改名、细分开关、说明、显示条件）
 * ================================================================== */
function StructEditor({
  ref,
  tree,
  patchSection,
  patchSubsection,
  fieldOptions,
  editable,
}: {
  ref: StructRef;
  tree: FormSection[];
  patchSection: (si: number, patch: Partial<FormSection>) => void;
  patchSubsection: (si: number, ui: number, patch: Partial<FormSubSection>) => void;
  fieldOptions: { key: string; label: string }[];
  editable: boolean;
}) {
  const s = tree[ref.si];
  if (!s) return null;
  const isSection = ref.kind === "section";
  const u = isSection ? null : (s.subsections ?? [])[ref.ui];
  return (
    <div className="aup-struct-editor">
      {isSection ? (
        <>
          <div className="aup-grid2">
            <div className="aup-row">
              <label>编码</label>
              <input
                className="aup-input"
                value={s.code}
                disabled={!editable}
                onChange={(e) => patchSection(ref.si, { code: e.target.value })}
              />
            </div>
            <div className="aup-row">
              <label>名称</label>
              <input
                className="aup-input"
                value={s.label}
                disabled={!editable}
                placeholder="如 管理信息"
                onChange={(e) => patchSection(ref.si, { label: e.target.value })}
              />
            </div>
          </div>
          <div className="aup-row" style={{ alignItems: "center" }}>
            <label>细分为小节</label>
            <label className="aup-check" style={{ paddingTop: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={s.subdivisible}
                disabled={!editable}
                onChange={(e) => patchSection(ref.si, { subdivisible: e.target.checked })}
              />
              <span>{s.subdivisible ? "已细分" : "未细分"}</span>
            </label>
            <span className="aup-muted" style={{ paddingTop: 6 }}>
              {s.subdivisible ? "板块下挂 A1/A2… 小节" : "板块直接挂题目"}
            </span>
          </div>
          <div className="aup-row" style={{ alignItems: "center" }}>
            <label>突出显示</label>
            <label className="aup-check" style={{ paddingTop: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={!!s.highlight}
                disabled={!editable}
                onChange={(e) => patchSection(ref.si, { highlight: e.target.checked })}
              />
              <span>{s.highlight ? "已开启" : "未开启"}</span>
            </label>
            <span className="aup-muted" style={{ paddingTop: 6 }}>
              作为前置说明等强调卡片突出显示
            </span>
          </div>
          <ShowWhenEditor value={s.showWhen} onChange={(v) => patchSection(ref.si, { showWhen: v ?? null })} fieldOptions={fieldOptions} />
        </>
      ) : u ? (
        <>
          <div className="aup-grid2">
            <div className="aup-row">
              <label>编码</label>
              <input
                className="aup-input"
                value={u.code}
                disabled={!editable}
                onChange={(e) => patchSubsection(ref.si, ref.ui, { code: e.target.value })}
              />
            </div>
            <div className="aup-row">
              <label>名称</label>
              <input
                className="aup-input"
                value={u.label}
                disabled={!editable}
                placeholder="如 研究项目信息"
                onChange={(e) => patchSubsection(ref.si, ref.ui, { label: e.target.value })}
              />
            </div>
          </div>
          <div className="aup-row">
            <label>说明</label>
            <textarea
              className="aup-textarea"
              value={u.description ?? ""}
              disabled={!editable}
              placeholder="本小节的填写说明（可选）"
              onChange={(e) => patchSubsection(ref.si, ref.ui, { description: e.target.value })}
            />
          </div>
          <ShowWhenEditor value={u.showWhen} onChange={(v) => patchSubsection(ref.si, ref.ui, { showWhen: v ?? null })} fieldOptions={fieldOptions} />
        </>
      ) : null}
    </div>
  );
}

export default function AupTemplateEditor() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const selectedId = idParam ? Number(idParam) : null;
  const [tree, setTree] = useState<FormSection[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [editingField, setEditingField] = useState<FieldPath | null>(null);
  const [editingStruct, setEditingStruct] = useState<StructRef | null>(null);
  const [addMenu, setAddMenu] = useState<{ si: number; ui?: number } | null>(null);
  const [search, setSearch] = useState("");

  const detailQuery = useQuery({
    queryKey: ["aup", "template", "detail", selectedId],
    queryFn: () => fetchAupTemplateById(selectedId!),
    enabled: selectedId != null,
  });

  const fieldOptions = useMemo(() => collectAllFields(tree), [tree]);
  const targets = useMemo(() => collectTargets(tree), [tree]);
  const revealMap = useMemo(() => buildRevealMap(tree), [tree]);

  useEffect(() => {
    const d = detailQuery.data;
    if (!d) return;
    setTree(d.sections ?? []);
    setName(d.name ?? "");
    setDescription(d.description ?? "");
    setEditingField(null);
    setEditingStruct(null);
    setAddMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data?.id]);

  const editable = detailQuery.data?.status === "DRAFT";
  const current = detailQuery.data;
  const showEditMode = editable && viewMode === "edit";

  /* ---- 树 CRUD / 排序 ---- */
  const patchSection = (si: number, patch: Partial<FormSection>) =>
    setTree((t) => t.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const patchSubsection = (si: number, ui: number, patch: Partial<FormSubSection>) =>
    setTree((t) =>
      t.map((s, i) =>
        i === si ? { ...s, subsections: (s.subsections ?? []).map((u, j) => (j === ui ? { ...u, ...patch } : u)) } : s
      )
    );
  const patchField = (path: FieldPath, patch: Partial<FormFieldDef>) =>
    setTree((t) =>
      t.map((s, i) => {
        if (i !== path.si) return s;
        if (path.ui == null) return { ...s, fields: (s.fields ?? []).map((f, j) => (j === path.fi ? { ...f, ...patch } : f)) };
        return {
          ...s,
          subsections: (s.subsections ?? []).map((u, j) =>
            j === path.ui ? { ...u, fields: u.fields.map((f, k) => (k === path.fi ? { ...f, ...patch } : f)) } : u
          ),
        };
      })
    );
  const getField = (path: FieldPath): FormFieldDef | undefined => {
    const s = tree[path.si];
    if (!s) return undefined;
    if (path.ui == null) return (s.fields ?? [])[path.fi];
    return (s.subsections ?? [])[path.ui]?.fields[path.fi];
  };

  const scrollToSection = (code: string) =>
    setTimeout(() => document.getElementById(`aup-section-${code}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  const addSection = () => {
    const code = nextSectionCode(tree.map((s) => s.code));
    const ns: FormSection = { code, label: "", subdivisible: false, subsections: [], fields: [] };
    setTree([...tree, ns]);
    setEditingStruct({ kind: "section", si: tree.length });
    setEditingField(null);
    setAddMenu(null);
    scrollToSection(code);
  };
  const removeSection = (si: number) => {
    setTree((t) => t.filter((_, i) => i !== si));
    setEditingStruct(null);
    setEditingField(null);
    setAddMenu(null);
  };
  const moveSection = (si: number, dir: -1 | 1) => {
    const next = move(tree, si, dir);
    if (next === tree) return;
    setTree(next);
    setEditingStruct(null);
    setEditingField(null);
  };

  const addSubsection = (si: number) => {
    const sec = tree[si];
    const subs = sec.subsections ?? [];
    const code = `${sec.code}${nextSubsectionNumber(subs.map((u) => u.code), sec.code)}`;
    const nu: FormSubSection = { code, label: "", fields: [] };
    setTree((t) => t.map((s, i) => (i === si ? { ...s, subdivisible: true, subsections: [...(s.subsections ?? []), nu] } : s)));
    setEditingStruct({ kind: "subsection", si, ui: subs.length });
    setEditingField(null);
    setAddMenu(null);
  };
  const removeSubsection = (si: number, ui: number) => {
    setTree((t) =>
      t.map((s, i) => (i === si ? { ...s, subsections: (s.subsections ?? []).filter((_, j) => j !== ui) } : s))
    );
    setEditingStruct(null);
    setEditingField(null);
    setAddMenu(null);
  };
  const moveSubsection = (si: number, ui: number, dir: -1 | 1) => {
    const sec = tree[si];
    const subs = sec.subsections ?? [];
    const next = move(subs, ui, dir);
    if (next === subs) return;
    setTree((t) => t.map((s, i) => (i === si ? { ...s, subsections: next } : s)));
    setEditingStruct(null);
    setEditingField(null);
  };

  const addFieldOfType = (si: number, ui: number | undefined, type: FieldType) => {
    const sec = tree[si];
    const parentCode = ui == null ? sec.code : (sec.subsections ?? [])[ui]?.code ?? sec.code;
    const key = nextFieldKey(parentCode, collectFieldKeys(sec));
    const nf: FormFieldDef = { fieldKey: key, label: "", type, required: false };
    const fi = ui == null ? (sec.fields ?? []).length : (sec.subsections ?? [])[ui]?.fields.length ?? 0;
    setTree((t) =>
      t.map((s, i) => {
        if (i !== si) return s;
        if (ui == null) return { ...s, fields: [...(s.fields ?? []), nf] };
        return { ...s, subsections: (s.subsections ?? []).map((u, j) => (j === ui ? { ...u, fields: [...u.fields, nf] } : u)) };
      })
    );
    setEditingField({ si, ui, fi });
    setAddMenu(null);
  };
  /** 复合模板：整组展开插入（字段键以唯一 base 为前缀，组内 showWhen 自洽） */
  const addFieldTemplate = (si: number, ui: number | undefined, tpl: FieldTemplate) => {
    const sec = tree[si];
    const parentCode = ui == null ? sec.code : (sec.subsections ?? [])[ui]?.code ?? sec.code;
    const base = nextFieldKey(parentCode, collectFieldKeys(sec));
    const fields = tpl.build(base);
    setTree((t) =>
      t.map((s, i) => {
        if (i !== si) return s;
        if (ui == null) return { ...s, fields: [...(s.fields ?? []), ...fields] };
        return { ...s, subsections: (s.subsections ?? []).map((u, j) => (j === ui ? { ...u, fields: [...u.fields, ...fields] } : u)) };
      })
    );
    setAddMenu(null);
    setEditingField(null);
  };
  const removeField = (path: FieldPath) => {
    setTree((t) =>
      t.map((s, i) => {
        if (i !== path.si) return s;
        if (path.ui == null) return { ...s, fields: (s.fields ?? []).filter((_, j) => j !== path.fi) };
        return {
          ...s,
          subsections: (s.subsections ?? []).map((u, j) =>
            j === path.ui ? { ...u, fields: u.fields.filter((_, k) => k !== path.fi) } : u
          ),
        };
      })
    );
    setEditingField(null);
  };
  const moveField = (path: FieldPath, dir: -1 | 1) => {
    const sec = tree[path.si];
    const list = path.ui == null ? (sec.fields ?? []) : ((sec.subsections ?? [])[path.ui]?.fields ?? []);
    const next = move(list, path.fi, dir);
    if (next === list) return;
    setTree((t) =>
      t.map((s, i) => {
        if (i !== path.si) return s;
        if (path.ui == null) return { ...s, fields: next };
        return { ...s, subsections: (s.subsections ?? []).map((u, j) => (j === path.ui ? { ...u, fields: next } : u)) };
      })
    );
  };

  /* ---- 选项侧展开 ---- */
  const applyExpand = (fieldKey: string, choiceType: ChoiceType, optionValue: string, target: TargetNode) => {
    const sw: ShowWhen = { field: fieldKey, op: choiceType === "multiple" ? "contains" : "equals", value: optionValue };
    if (target.kind === "section") patchSection(target.si, { showWhen: sw });
    else if (target.kind === "subsection") patchSubsection(target.si, target.ui, { showWhen: sw });
    else patchField({ si: target.si, ui: target.ui, fi: target.fi }, { showWhen: sw });
    toast.success(`已开启：选择「${optionValue}」后显示「${targetLabel(target)}」`);
  };
  const clearExpand = (target: TargetNode) => {
    if (target.kind === "section") patchSection(target.si, { showWhen: null });
    else if (target.kind === "subsection") patchSubsection(target.si, target.ui, { showWhen: null });
    else patchField({ si: target.si, ui: target.ui, fi: target.fi }, { showWhen: null });
  };

  /* 选项文本改动：value/label 同步，并把引用旧值的 showWhen 一并改到新值 */
  const handleOptionTextChange = (path: FieldPath, i: number, text: string) => {
    const field = getField(path);
    if (!field) return;
    const opts = normalizeOptions(field.options);
    const old = opts[i]?.value;
    patchField(path, { options: opts.map((o, j) => (j === i ? { value: text, label: text } : o)) });
    if (old != null && old !== text) {
      const patchSw = (sw: ShowWhen | null | undefined): ShowWhen | null => {
        if (sw && sw.field === field.fieldKey && String(sw.value ?? "") === old) return { ...sw, value: text };
        return sw ?? null;
      };
      setTree((t) =>
        t.map((s) => ({
          ...s,
          showWhen: patchSw(s.showWhen),
          subsections: (s.subsections ?? []).map((u) => ({
            ...u,
            showWhen: patchSw(u.showWhen),
            fields: u.fields.map((f) => ({ ...f, showWhen: patchSw(f.showWhen) })),
          })),
          fields: (s.fields ?? []).map((f) => ({ ...f, showWhen: patchSw(f.showWhen) })),
        }))
      );
    }
  };

  /* ---- 保存 / 发布 / 新建 ---- */
  const buildSaveBody = (): UpdateTemplateBody => ({
    name,
    description: description || undefined,
    sections: tree.map((s, si) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      sortOrder: si,
      subdivisible: s.subdivisible,
      showWhen: s.showWhen ?? null,
      highlight: s.highlight ?? false,
      subsections: (s.subsections ?? []).map((u, ui) => ({
        id: u.id,
        code: u.code,
        label: u.label,
        sortOrder: ui,
        description: u.description,
        showWhen: u.showWhen ?? null,
        fields: u.fields.map((f, fi) => fieldToSave(f, fi)),
      })),
      fields: (s.fields ?? []).map((f, fi) => fieldToSave(f, fi)),
    })),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateTemplateBody }) => updateAupTemplate(id, body),
    onSuccess: (d) => {
      setTree(d.sections ?? []);
      setName(d.name ?? "");
      setDescription(d.description ?? "");
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["aup", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => publishAupTemplate(id),
    onSuccess: () => {
      toast.success("已发布");
      qc.invalidateQueries({ queryKey: ["aup", "templates"] });
      qc.invalidateQueries({ queryKey: ["aup", "template", "detail", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  /* 导入内置模板到当前草稿（仅替换本地状态，确认后保存生效） */
  const seedMutation = useMutation({
    mutationFn: fetchAupDefaultSeed,
    onSuccess: (seed) => {
      setTree(seed.sections ?? []);
      setName(seed.name ?? "");
      setDescription(seed.description ?? "");
      setEditingField(null);
      setEditingStruct(null);
      setAddMenu(null);
      toast.success("已载入内置模板内容，确认后点击「保存草稿」生效");
    },
    onError: (e: Error) => toast.error(e.message || "导入内置模板失败"),
  });
  const doImportSeed = () => {
    if (!window.confirm("用内置 IACUC 模板内容替换当前草稿？当前草稿内容将丢失。")) return;
    seedMutation.mutate();
  };

  const doSave = () => {
    if (selectedId == null) return;
    saveMutation.mutate({ id: selectedId, body: buildSaveBody() });
  };
  const doPublish = () => {
    if (selectedId == null) return;
    if (!window.confirm("发布后将冻结当前草稿并使其对填写人生效，上一发布版本将归档。确认发布？")) return;
    publishMutation.mutate(selectedId);
  };
  const busy = saveMutation.isPending || publishMutation.isPending || seedMutation.isPending;

  /* ---- 渲染：字段（编辑态 = 悬浮出编辑；点「编辑」打开右侧抽屉） ---- */
  const renderFieldEdit = (si: number, ui: number | undefined, f: FormFieldDef, fi: number, isLast: boolean) => (
    <div className="aup-fw" key={`${si}-${ui}-${fi}-${f.fieldKey}`}>
      <FormField field={stripShowWhenDeep(f)} value={undefined} values={{}} onChange={() => {}} readOnly />
      <span className="aup-fw-acts">
        <button className="aup-btn small ghost" disabled={!editable} onClick={() => setEditingField({ si, ui, fi })}>✎ 编辑</button>
        <button className="aup-iconbtn" title="上移" disabled={!editable || fi === 0} onClick={() => moveField({ si, ui, fi }, -1)}>↑</button>
        <button className="aup-iconbtn" title="下移" disabled={!editable || isLast} onClick={() => moveField({ si, ui, fi }, 1)}>↓</button>
        <button className="aup-iconbtn danger" title="删除" disabled={!editable} onClick={() => removeField({ si, ui, fi })}>×</button>
      </span>
      {f.showWhen && <div className="aup-cond-banner small">{describeShowWhen(f.showWhen, fieldOptions)}</div>}
    </div>
  );

  const renderFieldPreview = (f: FormFieldDef) => (
    <FormField key={f.fieldKey} field={f} value={undefined} values={{}} onChange={() => {}} readOnly />
  );

  /* ---- 渲染：右侧字段编辑抽屉 ---- */
  const renderFieldDrawer = () => {
    if (!editingField) return null;
    const f = getField(editingField);
    if (!f) return null;
    const { si, ui, fi } = editingField;
    return (
      <div className="aup-drawer-mask" onClick={() => setEditingField(null)}>
        <div className="aup-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="aup-drawer-hd">
            <span className="aup-drawer-title">
              <span className="aup-type-ic">{TYPE_ICONS[f.type] ?? "?"}</span>
              编辑题目
              <span className="aup-muted" style={{ fontWeight: 400, fontSize: 12 }}>
                {f.fieldKey}
              </span>
            </span>
            <button className="aup-btn small primary" onClick={() => setEditingField(null)}>✓ 完成</button>
          </div>
          <div className="aup-drawer-body">
            <div className="aup-drawer-hint">修改即时生效到表单，点「✓ 完成」或点遮罩关闭。</div>
            <FieldEditorInline
              field={f}
              patch={(p) => patchField({ si, ui, fi }, p)}
              editable={editable}
              fieldOptions={fieldOptions}
              targets={targets}
              revealMap={revealMap}
              onChangeOptionText={(i, text) => handleOptionTextChange({ si, ui, fi }, i, text)}
              onApplyExpand={(val, t) => applyExpand(f.fieldKey, (f.config?.choiceType ?? "single") as ChoiceType, val, t)}
              onClearExpand={clearExpand}
              onClose={() => setEditingField(null)}
            />
          </div>
        </div>
      </div>
    );
  };

  /* ---- 渲染：小节（编辑态） ---- */
  const renderSubsectionEdit = (s: FormSection, si: number, u: FormSubSection, ui: number) => {
    const isEditingStruct = editingStruct?.kind === "subsection" && editingStruct.si === si && editingStruct.ui === ui;
    const fields = u.fields ?? [];
    return (
      <div key={`sub-${si}-${ui}-${u.code}`}>
        <div className="aup-sub-hd">
          <span className="aup-sub-code">{u.code}</span>
          <span>{u.label || "未命名小节"}</span>
          <span className="aup-spacer" style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            <button className="aup-iconbtn" title="改名 / 条件设置" disabled={!editable} onClick={() => setEditingStruct(isEditingStruct ? null : { kind: "subsection", si, ui })}>✎</button>
            <button className="aup-iconbtn" title="上移" disabled={!editable || ui === 0} onClick={() => moveSubsection(si, ui, -1)}>↑</button>
            <button className="aup-iconbtn" title="下移" disabled={!editable || ui === (s.subsections ?? []).length - 1} onClick={() => moveSubsection(si, ui, 1)}>↓</button>
            <button className="aup-iconbtn danger" title="删除小节" disabled={!editable} onClick={() => removeSubsection(si, ui)}>×</button>
          </span>
        </div>
        {u.description && <div className="aup-sub-desc">{u.description}</div>}
        {u.showWhen && <div className="aup-cond-banner small">{describeShowWhen(u.showWhen, fieldOptions)}</div>}
        {isEditingStruct && (
          <StructEditor
            ref={{ kind: "subsection", si, ui }}
            tree={tree}
            patchSection={patchSection}
            patchSubsection={patchSubsection}
            fieldOptions={fieldOptions}
            editable={editable}
          />
        )}
        <div className="aup-app aup-form-app">
          {fields.length === 0 && <div className="aup-muted" style={{ padding: "6px 0" }}>暂无题目，点下方「＋ 添加题目」</div>}
          {fields.map((f, fi) => renderFieldEdit(si, ui, f, fi, fi === fields.length - 1))}
        </div>
        <div className="aup-add-row">
          {addMenu?.si === si && addMenu.ui === ui ? (
            <TypeMenu onPick={(t) => addFieldOfType(si, ui, t)} onPickTemplate={(t) => addFieldTemplate(si, ui, t)} onClose={() => setAddMenu(null)} />
          ) : (
            <button className="aup-add-link" disabled={!editable} onClick={() => setAddMenu({ si, ui })}>
              ＋ 在 {u.code} 下添加题目
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ---- 渲染：板块（编辑态 / 预览态） ---- */
  const renderSectionEdit = (s: FormSection, si: number) => {
    const subs = s.subdivisible ? (s.subsections ?? []) : undefined;
    const isEditingStruct = editingStruct?.kind === "section" && editingStruct.si === si;
    const fields = s.fields ?? [];
    return (
      <section className="aup-ed-card" id={`aup-section-${s.code}`} key={`sec-${si}-${s.code}`}>
        <div className="aup-sec-hd">
          <span className="aup-code-badge">{s.code || "?"}</span>
          <span className="aup-sec-title">{s.label || "未命名板块"}</span>
          <span className="aup-sec-acts">
            {subs ? (
              <button className="aup-btn small ghost" disabled={!editable} onClick={() => addSubsection(si)}>＋ 小节</button>
            ) : (
              <button className="aup-btn small ghost" disabled={!editable} onClick={() => setAddMenu({ si })}>＋ 题目</button>
            )}
            <button className="aup-iconbtn" title="改名 / 条件设置" disabled={!editable} onClick={() => setEditingStruct(isEditingStruct ? null : { kind: "section", si })}>✎</button>
            <button className="aup-iconbtn" title="上移板块" disabled={!editable || si === 0} onClick={() => moveSection(si, -1)}>↑</button>
            <button className="aup-iconbtn" title="下移板块" disabled={!editable || si === tree.length - 1} onClick={() => moveSection(si, 1)}>↓</button>
            <button className="aup-iconbtn danger" title="删除板块" disabled={!editable} onClick={() => removeSection(si)}>×</button>
          </span>
        </div>
        {s.showWhen && (
          <div className="aup-cond-banner">
            <span>⚠ 此板块{describeShowWhen(s.showWhen, fieldOptions).replace(/^当/, "仅")}</span>
            <button className="aup-btn small" disabled={!editable} onClick={() => setEditingStruct({ kind: "section", si })}>修改条件</button>
          </div>
        )}
        {isEditingStruct && (
          <StructEditor
            ref={{ kind: "section", si }}
            tree={tree}
            patchSection={patchSection}
            patchSubsection={patchSubsection}
            fieldOptions={fieldOptions}
            editable={editable}
          />
        )}
        {subs ? (
          subs.map((u, ui) => renderSubsectionEdit(s, si, u, ui))
        ) : (
          <>
            <div className="aup-app aup-form-app">
              {fields.length === 0 && <div className="aup-muted" style={{ padding: "10px 0" }}>暂无题目，点上方或下方「＋ 添加题目」</div>}
              {fields.map((f, fi) => renderFieldEdit(si, undefined, f, fi, fi === fields.length - 1))}
            </div>
            {addMenu?.si === si && addMenu.ui == null && (
              <TypeMenu onPick={(t) => addFieldOfType(si, undefined, t)} onPickTemplate={(t) => addFieldTemplate(si, undefined, t)} onClose={() => setAddMenu(null)} />
            )}
          </>
        )}
      </section>
    );
  };

  const renderSectionPreview = (s: FormSection) => {
    const subs = s.subdivisible ? (s.subsections ?? []) : undefined;
    return (
      <section className="aup-ed-card" id={`aup-section-${s.code}`} key={`prev-${s.code}`}>
        <div className="aup-sec-hd" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <span className="aup-code-badge">{s.code || "?"}</span>
          <span className="aup-sec-title">{s.label || "未命名板块"}</span>
        </div>
        <div className="aup-app aup-form-app" style={{ marginTop: 8 }}>
          {subs ? (
            subs.map((u) => (
              <div key={u.code}>
                <div className="aup-sub-hd" style={{ marginTop: 14 }}>
                  <span className="aup-sub-code">{u.code}</span>
                  <span>{u.label}</span>
                </div>
                {u.description && <div className="aup-sub-desc">{u.description}</div>}
                {(u.fields ?? []).map(renderFieldPreview)}
              </div>
            ))
          ) : (
            (s.fields ?? []).map(renderFieldPreview)
          )}
        </div>
      </section>
    );
  };

  /* ---- 目录 ---- */
  const tocEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { code: string; label: string; sub: boolean; cond: boolean }[] = [];
    tree.forEach((s) => {
      const secMatch = !q || s.label.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      if (secMatch || q) out.push({ code: s.code, label: s.label, sub: false, cond: !!s.showWhen });
      (s.subsections ?? []).forEach((u) => {
        const subMatch = !q || u.label.toLowerCase().includes(q) || u.code.toLowerCase().includes(q);
        if (subMatch) out.push({ code: u.code, label: u.label, sub: true, cond: !!u.showWhen });
      });
    });
    return out;
  }, [tree, search]);

  if (detailQuery.isLoading) {
    return (
      <div className="aup">
        <style>{CSS}</style>
        <div className="aup-empty">加载中…</div>
      </div>
    );
  }

  if (selectedId == null) {
    return (
      <div className="aup">
        <style>{CSS}</style>
        <div className="aup-empty">模板不存在，请返回列表选择</div>
      </div>
    );
  }

  // 预览：与填写页一致，按空值求值 showWhen（空值即未填写）
  const visibleSections = showEditMode ? tree : tree.filter((s) => evaluateShowWhen(s.showWhen, {}));

  return (
    <div className="aup">
      <style>{CSS}</style>
      <div className="aup-topbar">
        <span className="aup-title">计划书模板配置</span>
        {current && <span className={`aup-tag ${current.status.toLowerCase()}`}>{statusLabel(current.status)}</span>}
        <input
          className="aup-input aup-top-name"
          value={name}
          disabled={!editable}
          placeholder="模板名称"
          title="模板名称"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="aup-spacer" />
        {editable && (
          <div className="aup-mode-toggle">
            <button className={viewMode === "edit" ? "active" : ""} onClick={() => { setViewMode("edit"); setEditingField(null); }}>编辑</button>
            <button className={viewMode === "preview" ? "active" : ""} onClick={() => { setViewMode("preview"); setEditingField(null); }}>预览</button>
          </div>
        )}
        <button className="aup-btn ghost" onClick={doSave} disabled={!editable || busy}>
          {saveMutation.isPending ? "保存中…" : "保存草稿"}
        </button>
        <button className="aup-btn primary" onClick={doPublish} disabled={!editable || busy}>
          {publishMutation.isPending ? "发布中…" : "发布"}
        </button>
      </div>

      <div className="aup-split">
        <aside className="aup-toc">
          <div className="hd">
            <span>目录</span>
            <span className="aup-muted">{tree.length} 板块</span>
          </div>
          <div className="search">
            <input
              className="aup-input"
              placeholder="搜索板块 / 小节…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="body">
            {tocEntries.length === 0 && <div className="aup-empty small">无匹配项</div>}
            {tocEntries.map((e) => (
              <div
                key={`${e.code}-${e.sub}`}
                className={`aup-toc-item${e.sub ? " sub" : ""}`}
                onClick={() => document.getElementById(`aup-section-${e.code}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <span className="aup-code-badge">{e.code}</span>
                <span className="lbl">{e.label || "未命名"}</span>
                {e.cond && <span className="cond-tag">条件</span>}
              </div>
            ))}
          </div>
          <div className="aup-toc-foot">
            <button className="aup-btn ghost" disabled={!editable} onClick={addSection}>＋ 新增板块</button>
          </div>
        </aside>

        <section className="aup-main">
          {!showEditMode && (
            <div className="aup-preview-hint">
              <span>◎ 预览模式：与填写人看到的一致（条件板块仅在勾选后出现）。切回「编辑」可调整。</span>
            </div>
          )}
          {visibleSections.length === 0 && (
            <div className="aup-ed-card">
              {tree.length === 0 ? (
                <div className="aup-empty-hero">
                  <div className="ic">📋</div>
                  <div className="t">当前草稿还没有内容</div>
                  <div className="d">
                    可以直接「导入内置模板」，把 IACUC 实验动物研究及使用计划（AUP）的完整框架载入当前草稿；
                    也可以从零开始新增板块。内置模板始终作为初始默认配置，新建草稿不会丢失它。
                  </div>
                  <div className="acts">
                    {editable && (
                      <button className="aup-btn primary" onClick={doImportSeed} disabled={seedMutation.isPending}>
                        {seedMutation.isPending ? "导入中…" : "↺ 导入内置模板"}
                      </button>
                    )}
                    {editable && (
                      <button className="aup-btn ghost" onClick={addSection}>＋ 新增板块</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="aup-empty">没有符合当前条件的板块，切回「编辑」查看全部板块。</div>
              )}
            </div>
          )}
          {showEditMode ? tree.map(renderSectionEdit) : visibleSections.map(renderSectionPreview)}
        </section>
      </div>
      {renderFieldDrawer()}
      <ScrollButtons />
    </div>
  );
}

function fieldToSave(f: FormFieldDef, fi: number) {
  return {
    id: f.id,
    fieldKey: f.fieldKey,
    label: f.label,
    description: f.description,
    type: f.type,
    options: f.options,
    dictKey: f.dictKey,
    required: f.required,
    showWhen: f.showWhen ?? null,
    sortOrder: fi,
    config: f.config,
  };
}
