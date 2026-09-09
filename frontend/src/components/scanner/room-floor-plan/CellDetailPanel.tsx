import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";
import type { CageShelfCell } from "@/api/domains/cageShelf.api";
import { CAGE_TYPE_LABEL } from "@/features/cage-shelf/components/CageCellOverlays";
import { useCageColors } from "@/features/cage-shelf/components/CageColorContext";
import { resolveCageType } from "./resolveCageType";

/** cage_type_code 四值徽标色（架构文档 §4） */
const CAGE_TYPE_COLOR: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#fef3c7", fg: "#b45309" },
  2: { bg: "#d1fae5", fg: "#047857" },
  3: { bg: "#ffe4e6", fg: "#be123c" },
  4: { bg: "#dbeafe", fg: "#1d4ed8" },
};

/** 字段清单按 docs/06-开发参考/2026-08-25-笼位信息字段架构-开发参考.md；derived=true 标「自动获取」 */
const FORM_ROWS: { key: string; label: string; group: string; derived: boolean }[] = [
  { key: "pi_name", label: "课题组长", group: "项目信息", derived: true },
  { key: "project_pi_name", label: "项目组长", group: "项目信息", derived: true },
  { key: "project_name", label: "项目名称", group: "项目信息", derived: true },
  { key: "department_name", label: "部门", group: "项目信息", derived: true },
  { key: "aup_number", label: "AUP 注册号", group: "项目信息", derived: true },
  { key: "experimenter_name", label: "实验员", group: "项目信息", derived: true },
  { key: "lab_assistant_name", label: "管家", group: "项目信息", derived: true },
  { key: "special_breeding_name", label: "特殊饲养名称", group: "状态标记", derived: true },
  { key: "special_breeding_desc", label: "特殊饲养描述", group: "状态标记", derived: true },
  { key: "animal_strain_name", label: "动物品系", group: "动物信息", derived: true },
  { key: "animal_sex", label: "性别", group: "动物信息", derived: true },
  { key: "animal_week_age", label: "周龄", group: "动物信息", derived: true },
  { key: "animal_male_number", label: "雄性数量", group: "动物信息", derived: true },
  { key: "animal_female_number", label: "雌性数量", group: "动物信息", derived: true },
  { key: "animal_come_from", label: "动物来源", group: "动物信息", derived: true },
  { key: "cage_use_time", label: "使用时间", group: "动物信息", derived: true },
];

const GROUPS = ["项目信息", "状态标记", "动物信息"];

/** snake_case → PascalCase，用于匹配 cageBoxInfo 的 PascalCase 键 */
function toPascal(key: string): string {
  return key.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

/** snake_case → camelCase，用于匹配 cageBoxInfo 的 camelCase 键（ARO cageBoxVo 原始口径） */
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
  return "-";
}

function firstText(...values: unknown[]): string {
  for (const v of values) {
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * 笼位详情弹窗内容（**只读**，不提供编辑/输入/上传）。
 * 字段清单按 `docs/06-开发参考/2026-08-25-笼位信息字段架构-开发参考.md`，
 * 展示形式对齐笼架信息页的详情卡（字段卡 + 自动获取徽章 + 二维码）。
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
  const [qrZoom, setQrZoom] = useState(false);
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
  const { colors: cageColors } = useCageColors();
  /** 表单里的状态标记（合笼/特殊饲养/需分笼/健康异常/动物转移…），比 cage_type_code 更能表达当前状态 */
  const statusChips = (cell.specialStatuses ?? []).filter((s) => s.code !== "NORMAL");

  const experimentDesc = pick(cell, "experiment_desc");
  const photos: string[] = (() => {
    const raw = pick(cell, "images_json");
    if (raw === "-") return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-container)] shadow-2xl">
      {/* 头部：状态徽标 + 位号 + 盒号 + 关闭 */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {statusChips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {statusChips.map((s) => {
                const c = cageColors[s.code];
                return (
                  <span
                    key={s.code}
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      background: c?.bg ?? "var(--app-color-surface-hover)",
                      color: c?.border ?? "var(--app-color-text-secondary)",
                      borderColor: c?.border ?? "var(--app-color-border-default)",
                    }}
                  >
                    {s.label || s.code}
                  </span>
                );
              })}
            </div>
          ) : typeColor ? (
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold"
              style={{ background: typeColor.bg, color: typeColor.fg, borderColor: typeColor.fg }}
            >
              {CAGE_TYPE_LABEL[ct] ?? "-"}
            </span>
          ) : null}
          <span className="text-sm font-bold text-[var(--app-color-text-primary)]">{cell.position}</span>
          {cageBoxCode ? (
            <span className="truncate font-mono text-[10px] text-[var(--app-color-text-tertiary)]">
              盒:{cageBoxCode}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="shrink-0 text-xs text-[var(--app-color-text-tertiary)] transition-colors hover:text-[var(--app-color-text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="app-themed-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {/* 二维码 */}
        {animalCageId ? (
          <div className="flex items-center gap-3 py-1">
            <div
              className="shrink-0 cursor-zoom-in rounded-lg border border-[var(--app-color-border-default)] bg-white p-1.5"
              title="点击放大"
              onClick={() => setQrZoom(true)}
            >
              <QRCodeSVG value={animalCageId} size={112} level="M" />
            </div>
            <div className="min-w-0 text-[10px] leading-relaxed text-[var(--app-color-text-tertiary)]">
              <div className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">笼位二维码</div>
              <div className="break-all font-mono">笼位ID: {animalCageId}</div>
              <div>点击二维码可放大查看</div>
            </div>
          </div>
        ) : null}

        {/* 关键信息 */}
        <div className="mt-3 border-t border-[var(--app-color-border-default)] pt-2.5">
          <div className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">关键信息</div>
          <div className="mt-0.5 text-[9px] text-[var(--app-color-text-tertiary)]">
            只读 · 数据由系统自动获取
          </div>
        </div>

        {GROUPS.map((g) => {
          const rows = FORM_ROWS.filter((r) => r.group === g);
          if (rows.length === 0) return null;
          const groupMasked = masked && g === "项目信息";
          return (
            <div key={g} className="mt-2.5">
              <div className="mb-0.5 flex items-center gap-2 text-[10px] font-bold tracking-wider text-[var(--app-color-text-tertiary)]">
                {g}
                {groupMasked ? (
                  <span className="rounded bg-[var(--app-color-surface-hover)] px-1.5 py-px font-medium tracking-normal">
                    非本课题组 · 已脱敏
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-x-6">
                {rows.map((r) => {
                  const value = groupMasked ? "***" : pick(cell, r.key);
                  return (
                    <div
                      key={r.key}
                      className="min-w-0 border-b border-[var(--app-color-border-default)] py-1.5"
                    >
                      <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{r.label}</div>
                      <div
                        className={
                          groupMasked
                            ? "mt-0.5 break-words font-mono text-[12px] text-[var(--app-color-text-tertiary)]"
                            : "mt-0.5 break-words text-[12px] text-[var(--app-color-text-primary)]"
                        }
                      >
                        {value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* 实验记录（只读） */}
        <div className="border-t border-[var(--app-color-border-default)] pt-2">
          <div className="mb-1.5 text-[11px] font-semibold text-[var(--app-color-text-primary)]">📝 实验记录</div>
          <div className="min-h-[48px] whitespace-pre-wrap break-words py-1 text-[11px] text-[var(--app-color-text-primary)]">
            {experimentDesc === "-" ? (
              <span className="text-[var(--app-color-text-tertiary)]">暂无记录</span>
            ) : (
              experimentDesc
            )}
          </div>
        </div>

        {/* 照片（只读） */}
        <div className="mt-2 border-t border-[var(--app-color-border-default)] pt-2">
          <div className="mb-1.5 text-[11px] font-semibold text-[var(--app-color-text-primary)]">
            🧪 实验记录照片 ({photos.length})
          </div>
          {photos.length === 0 ? (
            <div className="text-[10px] text-[var(--app-color-text-tertiary)]">暂无照片</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`照片${i + 1}`}
                  className="h-16 w-16 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] object-cover"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 二维码放大 */}
      {qrZoom && animalCageId ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setQrZoom(false)}
        >
          <div className="rounded-xl bg-white p-4">
            <QRCodeSVG value={animalCageId} size={280} level="M" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
