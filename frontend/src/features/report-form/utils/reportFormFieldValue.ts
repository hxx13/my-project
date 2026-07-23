import type { FieldDefinition } from '../types';

export type DatetimeParts = {
  date: string;
  time: string;
  /** 是否应展示时间选择（值含非 00:00 时刻，或用户主动展开） */
  hasExplicitTime: boolean;
};

/** 解析填报日期时间：日期与时刻分离 */
export function parseDatetimeParts(value: unknown): DatetimeParts {
  if (value == null || value === '' || value === 'null') {
    return { date: '', time: '', hasExplicitTime: false };
  }
  const s = String(value).trim();
  if (!s) return { date: '', time: '', hasExplicitTime: false };

  const withTime = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/);
  if (withTime) {
    const hh = withTime[2];
    const mm = withTime[3];
    const isMidnight = hh === '00' && mm === '00';
    return {
      date: withTime[1],
      time: `${hh}:${mm}`,
      hasExplicitTime: !isMidnight,
    };
  }

  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) {
    return { date: dateOnly[1], time: '', hasExplicitTime: false };
  }

  return { date: '', time: '', hasExplicitTime: false };
}

/** 合并日期与可选时刻；无时刻时仅存 YYYY-MM-DD */
export function combineDatetimeParts(
  date: string,
  time: string,
  includeTime: boolean,
): string | undefined {
  if (!date) return undefined;
  if (!includeTime || !time) return date;
  return `${date}T${time}`;
}

/** 非编辑态展示：默认仅日期，含时刻时显示「日期 时:分」 */
export function formatDatetimeDisplay(value: unknown): string {
  const { date, time, hasExplicitTime } = parseDatetimeParts(value);
  if (!date) return '';
  if (hasExplicitTime && time) return `${date} ${time}`;
  return date;
}

/** 将后端/导入的日期时间规范为组件可识别的值（日期或 YYYY-MM-DDTHH:mm） */
export function normalizeDatetimeForInput(value: unknown): string {
  const parts = parseDatetimeParts(value);
  if (!parts.date) return '';
  if (parts.hasExplicitTime && parts.time) {
    return `${parts.date}T${parts.time}`;
  }
  return parts.date;
}

/** 保存前规范日期时间；无效或空白则返回 null（应从 payload 剔除） */
export function normalizeDatetimeForSave(value: unknown): string | null {
  if (value == null || value === '' || value === 'null') return null;
  const s = String(value).trim();
  if (!s) return null;

  const withTime = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (withTime) return `${withTime[1]}T${withTime[2]}`;

  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return dateOnly[1];

  return null;
}

/** 按字段类型清洗整表填报值（自动保存/提交前调用） */
export function sanitizeFieldValuesForSave(
  fields: Record<string, FieldDefinition> | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (!fields) return { ...values };
  const out: Record<string, unknown> = { ...values };
  for (const [key, field] of Object.entries(fields)) {
    if (field.type !== 'DATETIME') continue;
    const normalized = normalizeDatetimeForSave(out[key]);
    if (normalized == null) delete out[key];
    else out[key] = normalized;
  }
  return out;
}

/** 加载填报数据后规范展示值 */
export function sanitizeFieldValuesForDisplay(
  fields: Record<string, FieldDefinition> | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (!fields) return { ...values };
  const out: Record<string, unknown> = { ...values };
  for (const [key, field] of Object.entries(fields)) {
    if (field.type !== 'DATETIME') continue;
    out[key] = normalizeDatetimeForInput(out[key]);
  }
  return out;
}
