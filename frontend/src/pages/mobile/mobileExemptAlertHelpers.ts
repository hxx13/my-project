/** 手机 H5 豁免通知展示 — 与小程序 studentAlertHelpers 对齐 */
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { parseExemptRoomNames } from "@/constants/exemptDurationPresets";
import { decodeHtmlEntitiesIfNeeded } from "./mobileNoticePresentation";

export interface ExemptDisplayFields {
  modeLabel: string;
  expireAt: string;
  remainingCount: string;
  roomNames: string;
  roomCount: string;
  scopeText: string;
}

function stripHtmlPreview(html: string): string {
  return decodeHtmlEntitiesIfNeeded(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function looksLikeRawRoomPayload(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.startsWith("{") || t.startsWith("[")) return true;
  if (/^\[?\s*\{/.test(t)) return true;
  if (t.includes("[object Object]")) return true;
  if (t.includes("roomId") || t.includes("roomName")) return true;
  if (t.includes("&quot;") && (t.includes("roomId") || t.includes("roomName"))) return true;
  return false;
}

function looksLikeTechnicalRoomId(text: string): boolean {
  const t = text.trim();
  if (!t || hasCjk(t)) return false;
  if (looksLikeRawRoomPayload(t)) return true;
  return /^[A-Za-z0-9_\-./]+$/.test(t) && t.length >= 6;
}

function dedupeStrings(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function extractRoomNamesFromJsonish(text: string): string[] {
  const out: string[] = [];
  const re = /"roomName"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim());
    }
  }
  return dedupeStrings(out);
}

function parseRoomSegment(segment: string): string[] {
  const seg = segment.trim();
  if (!seg) return [];
  if (seg.startsWith("[")) {
    return parseExemptRoomNames(seg).filter((name) => !looksLikeTechnicalRoomId(name));
  }
  if (seg.startsWith("{")) {
    try {
      const one = JSON.parse(seg) as { roomName?: string; name?: string };
      const name = one.roomName?.trim() || one.name?.trim();
      return name && !looksLikeTechnicalRoomId(name) ? [name] : extractRoomNamesFromJsonish(seg);
    } catch {
      return extractRoomNamesFromJsonish(seg);
    }
  }
  if (looksLikeRawRoomPayload(seg)) return extractRoomNamesFromJsonish(seg);
  return looksLikeTechnicalRoomId(seg) ? [] : [seg];
}

/** 将授权房间原始值（JSON/ID/脏 HTML 文本）转为可读房间名，用顿号连接 */
export function normalizeExemptRoomDisplay(raw: string): string {
  const text = decodeHtmlEntitiesIfNeeded(raw).trim();
  if (!text) return "";

  if (text.startsWith("[")) {
    const fromArray = parseExemptRoomNames(text).filter((name) => !looksLikeTechnicalRoomId(name));
    if (fromArray.length) return dedupeStrings(fromArray).join("、");
  }

  if (looksLikeRawRoomPayload(text)) {
    const fromJsonish = extractRoomNamesFromJsonish(text);
    if (fromJsonish.length) return fromJsonish.join("、");
  }

  const segments = text.split(/[、,，；;]/).map((s) => s.trim()).filter(Boolean);
  const names: string[] = [];
  for (const segment of segments) {
    names.push(...parseRoomSegment(segment));
  }
  const deduped = dedupeStrings(names);
  if (deduped.length) return deduped.join("、");

  if (looksLikeRawRoomPayload(text) || looksLikeTechnicalRoomId(text)) return "";
  return text;
}

function escapePlainText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseExemptFieldsFromPlain(plain: string): ExemptDisplayFields {
  const text = plain.trim();
  const modeMatch = text.match(/免冻结豁免[^（]*（([^）]+)）/);
  const expireMatch = text.match(/有效期至\s*[:：]\s*([^\s]+(?:\s+[^\s]+)?)/);
  const countMatch = text.match(/剩余次数\s*[:：]\s*([^授权]+?)(?=授权|$)/);
  const roomsMatch = text.match(/授权房间\s*[:：]\s*(.+)/);
  const roomCountMatch = text.match(/授权房间数\s*[:：]\s*(\d+)/);
  const scopeMatch = text.match(/授权范围\s*[:：]\s*(.+)/);
  const rawRooms = roomsMatch ? roomsMatch[1].trim() : "";
  let roomNames = normalizeExemptRoomDisplay(rawRooms);
  let roomCount = roomCountMatch ? roomCountMatch[1].trim() : "";
  if (!roomNames && rawRooms && looksLikeRawRoomPayload(rawRooms)) {
    const inferred = parseRoomSegment(rawRooms);
    if (!inferred.length && !roomCount) {
      roomCount = String(Math.max(1, (rawRooms.match(/roomId/g) || []).length));
    }
  }
  return {
    modeLabel: modeMatch ? modeMatch[1].trim() : "",
    expireAt: expireMatch ? expireMatch[1].trim() : "",
    remainingCount: countMatch ? countMatch[1].trim() : "",
    roomNames,
    roomCount,
    scopeText: scopeMatch ? scopeMatch[1].trim() : "",
  };
}

export function parseExemptFields(item: MobileAlertItem): ExemptDisplayFields {
  return parseExemptFieldsFromPlain(stripHtmlPreview(String(item.contentHtml || "")));
}

/** 详情正文：不含与标题/角标重复的「免冻结豁免」大标题 */
export function buildExemptDisplayHtml(fields: ExemptDisplayFields): string {
  const html: string[] = [];
  if (fields.modeLabel) {
    html.push(`<p>豁免模式：${escapePlainText(fields.modeLabel)}</p>`);
  }
  if (fields.expireAt) {
    html.push(`<p>有效期至：${escapePlainText(fields.expireAt)}</p>`);
  }
  if (fields.remainingCount) {
    html.push(`<p>剩余次数：${escapePlainText(fields.remainingCount)}</p>`);
  }
  if (fields.roomNames) {
    html.push(`<p>授权房间：${escapePlainText(fields.roomNames)}</p>`);
  } else if (fields.roomCount) {
    html.push(`<p>授权房间数：${escapePlainText(fields.roomCount)}</p>`);
  } else if (fields.scopeText) {
    html.push(`<p>${escapePlainText(fields.scopeText)}</p>`);
  }
  return html.join("");
}

export function resolveExemptAlertTitle(): string {
  return "免冻结豁免";
}

export function buildExemptListPreview(fields: ExemptDisplayFields): string {
  const line1Parts: string[] = [];
  if (fields.modeLabel) line1Parts.push(fields.modeLabel);
  if (fields.expireAt) line1Parts.push(`有效期至 ${fields.expireAt}`);
  if (fields.remainingCount) line1Parts.push(`剩余 ${fields.remainingCount}`);
  let line2 = "";
  if (fields.roomNames) {
    line2 = `授权房间：${fields.roomNames}`;
  } else if (fields.roomCount) {
    line2 = `授权房间数：${fields.roomCount}`;
  } else if (fields.scopeText) {
    line2 = fields.scopeText;
  }
  const line1 = line1Parts.join(" · ");
  if (line1 && line2) return `${line1} · ${line2}`;
  return line1 || line2 || "非开放时段可扫码进入授权房间";
}

export function prepareExemptAlertBodyHtml(item: MobileAlertItem): string {
  return buildExemptDisplayHtml(parseExemptFields(item));
}

export function alertDisplayPriority(kind?: string): number {
  if (kind === "exempt") return 0;
  if (kind === "violation") return 1;
  return 2;
}

/** 首页/公告列表：豁免置顶，其余按时间倒序 */
export function sortMobileAnnouncementsForDisplay(items: MobileAlertItem[]): MobileAlertItem[] {
  return [...items].sort((a, b) => {
    const pa = alertDisplayPriority(a.kind);
    const pb = alertDisplayPriority(b.kind);
    if (pa !== pb) return pa - pb;
    const ta = a.publishAt || a.createdAt || "";
    const tb = b.publishAt || b.createdAt || "";
    return String(tb).localeCompare(String(ta));
  });
}
