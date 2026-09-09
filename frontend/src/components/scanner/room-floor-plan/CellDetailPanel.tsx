import { QRCodeSVG } from "qrcode.react";
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

/** snake_case → PascalCase，用于匹配 cageBoxInfo 的键 */
function toPascal(key: string): string {
  return key.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function pick(cell: CageShelfCell, key: string): string {
  const sources = [
    (cell as unknown as { detail?: Record<string, unknown> }).detail,
    cell.cageBoxInfo,
    cell as unknown as Record<string, unknown>,
  ];
  const pascal = toPascal(key);
  for (const src of sources) {
    if (!src) continue;
    const v = src[key] ?? src[pascal];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return "—";
}

function firstText(...values: unknown[]): string {
  for (const v of values) {
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function CellDetailPanel({ cell, onClose }: { cell: CageShelfCell; onClose: () => void }) {
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--app-color-border-default)] px-3 py-2">
        <span className="text-xs font-bold text-[var(--app-color-text-primary)]">
          {cell.position} · 笼位详情
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--app-color-text-tertiary)] transition-colors hover:text-[var(--app-color-text-primary)]"
        >
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed">
        {/* 头部：表外固定字段 */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] text-[var(--app-color-text-tertiary)]">坐标</span>
          <span className="font-mono text-[var(--app-color-text-primary)]">
            x{cell.x} / y{cell.y}
          </span>
          {typeColor ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: typeColor.bg, color: typeColor.fg }}
            >
              {CAGE_TYPE_LABEL[ct] ?? "—"}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">—</span>
          )}
          {cageBoxCode && (
            <span className="font-mono text-[10px] text-[var(--app-color-text-tertiary)]">
              盒:{cageBoxCode}
            </span>
          )}
        </div>

        {animalCageId && (
          <div className="mb-2 flex items-center gap-3 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2 py-2">
            <QRCodeSVG value={animalCageId} size={104} level="M" includeMargin />
            <div className="min-w-0 text-[10px] text-[var(--app-color-text-tertiary)]">
              <div className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">
                笼位二维码
              </div>
              <div className="break-all font-mono">笼位ID: {animalCageId}</div>
            </div>
          </div>
        )}

        {GROUPS.map((g) => (
          <div key={g} className="mb-2">
            <div className="mb-1 text-[10px] font-bold tracking-wider text-[var(--app-color-text-tertiary)]">
              {g}
            </div>
            <div className="space-y-1">
              {FORM_ROWS.filter((r) => r.group === g).map((r) => (
                <Row key={r.key} label={r.label} value={pick(cell, r.key)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-[var(--app-color-text-tertiary)]">{label}</span>
      <span className="min-w-0 truncate text-right text-[var(--app-color-text-primary)]">{value}</span>
    </div>
  );
}
