import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import { resolveCageType } from "./resolveCageType";

/** cage_type_code 四值徽标色（架构文档 §4） */
const CAGE_TYPE_COLOR: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#fef3c7", fg: "#b45309" },
  2: { bg: "#d1fae5", fg: "#047857" },
  3: { bg: "#ffe4e6", fg: "#be123c" },
  4: { bg: "#dbeafe", fg: "#1d4ed8" },
};

/** 表内表单字段（cage_info_value）——项目信息 7 + 动物信息 7 + 本地扩展 3 */
const FORM_ROWS: { key: string; label: string; group: string }[] = [
  { key: "pi_name", label: "课题组长", group: "项目信息" },
  { key: "project_pi_name", label: "项目组长", group: "项目信息" },
  { key: "project_name", label: "项目名称", group: "项目信息" },
  { key: "department_name", label: "部门", group: "项目信息" },
  { key: "aup_number", label: "AUP 注册号", group: "项目信息" },
  { key: "experimenter_name", label: "实验员", group: "项目信息" },
  { key: "lab_assistant_name", label: "管家", group: "项目信息" },
  { key: "animal_strain_name", label: "动物品系", group: "动物信息" },
  { key: "animal_sex", label: "性别", group: "动物信息" },
  { key: "animal_week_age", label: "周龄", group: "动物信息" },
  { key: "animal_male_number", label: "雄性数量", group: "动物信息" },
  { key: "animal_female_number", label: "雌性数量", group: "动物信息" },
  { key: "animal_come_from", label: "动物来源", group: "动物信息" },
  { key: "cage_use_time", label: "使用时间", group: "动物信息" },
  { key: "experiment_desc", label: "实验记录", group: "本地扩展" },
  { key: "images_json", label: "照片", group: "本地扩展" },
  { key: "extra_data", label: "本地扩展数据", group: "本地扩展" },
];

const GROUPS = ["项目信息", "动物信息", "本地扩展"];

/** snake_case → PascalCase，用于匹配 cageBoxInfo 的 PascalCase 键 */
function toPascal(key: string): string {
  return key.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

/** snake_case → camelCase，用于匹配 cageBoxInfo 的 camelCase 键（ARO cageBoxVo 的原始口径） */
function toCamel(key: string): string {
  const pascal = toPascal(key);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** canonical 字段与 ARO cageBoxVo 键名不一致的少数几个，单独映射 */
const KEY_ALIAS: Record<string, string[]> = {
  cage_use_time: ["createTime"],
};

function pick(cell: CageShelfCell, key: string): string {
  const sources = [
    (cell as unknown as { detail?: Record<string, unknown> }).detail,
    cell.cageBoxInfo,
    cell as unknown as Record<string, unknown>,
  ];
  const candidates = [key, toPascal(key), toCamel(key), ...(KEY_ALIAS[key] ?? [])];
  for (const src of sources) {
    if (!src) continue;
    for (const k of candidates) {
      const v = src[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
    }
  }
  return "—";
}

function firstText(...values: unknown[]): string {
  for (const v of values) {
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * 笼位详情弹窗内容。字段清单严格按
 * `docs/06-开发参考/2026-08-25-笼位信息字段架构-开发参考.md`：
 * 头部为表外固定字段（笼位 ID/二维码、坐标、cage_type_code 徽标、笼盒编号），
 * 主体为表内表单字段（项目信息 7 + 动物信息 7 + 本地扩展 3）；
 * 7 个状态标记按文档「留表单不渲染」。
 */
export function CellDetailPanel({
  cell,
  masked = false,
  onClose,
}: {
  cell: CageShelfCell;
  /** 非本课题组笼位：项目信息整组打码，与笼架信息页的脱敏口径一致 */
  masked?: boolean;
  onClose: () => void;
}) {
  const detail = (cell as unknown as { detail?: Record<string, unknown> }).detail;
  const cbi = cell.cageBoxInfo;
  const animalCageId = firstText(
    (cell as unknown as { id?: unknown }).id,
    detail?.animalCageId,
    cbi?.id,
  );
  const cageBoxCode = firstText(detail?.cageBoxCode, cbi?.cageBoxCode, cbi?.CageBoxQrCode);
  const ct = resolveCageType(cell) ?? 0;
  const typeColor = CAGE_TYPE_COLOR[ct];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-container)] shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--app-color-border-default)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-base font-bold text-[var(--app-color-text-primary)]">{cell.position}</span>
          {typeColor ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: typeColor.bg, color: typeColor.fg }}
            >
              {CAGE_TYPE_LABEL[ct] ?? "—"}
            </span>
          ) : null}
          {cageBoxCode ? (
            <span className="truncate font-mono text-[11px] text-[var(--app-color-text-tertiary)]">
              盒 {cageBoxCode}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="app-themed-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* 头部：二维码 + 坐标 */}
        <div className="mb-3 flex items-center gap-4">
          {animalCageId ? (
            <div className="shrink-0 rounded-lg border border-[var(--app-color-border-default)] bg-white p-2">
              <QRCodeSVG value={animalCageId} size={96} level="M" />
            </div>
          ) : null}
          <div className="min-w-0 text-[11px] leading-relaxed text-[var(--app-color-text-secondary)]">
            <div className="mb-1 text-[10px] font-bold tracking-wider text-[var(--app-color-text-tertiary)]">
              笼位标识
            </div>
            <div className="break-all font-mono">笼位 ID：{animalCageId || "—"}</div>
            <div>
              坐标：x{cell.x} / y{cell.y}
            </div>
          </div>
        </div>

        {GROUPS.map((g) => (
          <div key={g} className="mb-3">
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold tracking-wider text-[var(--app-color-text-tertiary)]">
              {g}
              {masked && g === "项目信息" ? (
                <span className="rounded bg-[var(--app-color-surface-hover)] px-1.5 py-px font-medium tracking-normal text-[var(--app-color-text-tertiary)]">
                  非本课题组 · 已脱敏
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {FORM_ROWS.filter((r) => r.group === g).map((r) => {
                const hide = masked && g === "项目信息";
                const value = hide ? "***" : pick(cell, r.key);
                return (
                  <div key={r.key} className="scan-inner-row min-w-0 px-2.5 py-1.5">
                    <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{r.label}</div>
                    <div
                      className={
                        hide
                          ? "truncate font-mono text-[12px] font-medium text-[var(--app-color-text-tertiary)]"
                          : "truncate text-[12px] font-medium text-[var(--app-color-text-primary)]"
                      }
                      title={hide ? "非本课题组笼位，该字段已脱敏" : value}
                    >
                      {value}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
