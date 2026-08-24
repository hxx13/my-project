/**
 * 学生端通知分层：
 * - 首页「公告通知」：扫码弹窗公告（TwinScanPopupAnnouncement，kind=announcement）
 * - 「消息通知」页：个人提醒（豁免/违规/物资/延迟审核反馈）
 */
const springAuth = require('./springAuth.js');
const exemptUtil = require('./exemptDurationPresets.js');

/** mp-home 公开公告（教职工首页），非扫码弹窗 */
var PUBLIC_BULLETIN_KINDS = { release: true, bulletin: true };

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/** 管理端 student-violations / 扫码弹窗同源公告 */
function isScanPopupBulletinKind(kind) {
  return String(kind || '') === 'announcement';
}

function isPersonalAlertKind(kind) {
  var k = String(kind || '');
  return k === 'exempt' || k === 'violation' || k === 'material_feedback' || k === 'scan_delay_feedback';
}

function isStudentMobileAlertKind(kind) {
  var k = String(kind || '');
  if (!k || PUBLIC_BULLETIN_KINDS[k]) return false;
  return isPersonalAlertKind(k) || isScanPopupBulletinKind(k);
}

function isImportantReminderKind(kind) {
  return String(kind || '') === 'exempt';
}

function kindLabel(kind) {
  var map = {
    violation: '违规提醒',
    exempt: '豁免',
    material_feedback: '物资审核',
    scan_delay_feedback: '延迟申请',
    announcement: '公告',
  };
  return map[kind] || '公告';
}

function kindColors(kind) {
  var map = {
    violation: { bg: '#fee2e2', color: '#dc2626' },
    exempt: { bg: '#dcfce7', color: '#16a34a' },
    material_feedback: { bg: '#fef3c7', color: '#a16207' },
    scan_delay_feedback: { bg: '#e0e7ff', color: '#4338ca' },
    announcement: { bg: '#dbeafe', color: '#2563eb' },
  };
  return map[kind] || { bg: '#dbeafe', color: '#2563eb' };
}

function importantReminderColors() {
  return { bg: 'rgba(172,23,54,0.1)', color: '#ac1736' };
}

function alertDisplayPriority(kind) {
  if (kind === 'exempt') return 0;
  if (kind === 'violation') return 1;
  return 2;
}

function formatTime(t) {
  if (!t) return '';
  var s = String(t);
  return s.length > 16 ? s.substring(0, 16) : s;
}

function decodeHtmlEntitiesIfNeeded(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (!text || text.indexOf('&') < 0) return text;
  if (text.indexOf('<') >= 0 && text.indexOf('&lt;') < 0) return text;
  return text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function normalizeContentHtml(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    if (typeof raw.html === 'string') return decodeHtmlEntitiesIfNeeded(raw.html);
    if (typeof raw.content === 'string') return decodeHtmlEntitiesIfNeeded(raw.content);
    return '';
  }
  return decodeHtmlEntitiesIfNeeded(String(raw));
}

/** 剥离旧版/脏数据中的来源、时间等元数据行，仅保留违规正文 */
function extractViolationBodyForDisplay(raw) {
  var text = normalizeContentHtml(raw).trim();
  if (!text) return '';
  text = text.replace(/^\s*来源\s*[:：]\s*.+$/gim, '');
  text = text.replace(/^\s*时间\s*[:：]\s*.+$/gim, '');
  text = text.replace(/^\s*原因\s*[:：]\s*/gim, '');
  text = text.replace(/\s*[·•]\s*来源\s*[:：]\s*[^·•\n]+/gi, '');
  text = text.replace(/\s*来源\s*[:：]\s*[^·•\n]+/gi, '');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function stripHtmlPreview(html) {
  return normalizeContentHtml(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text, max) {
  var s = String(text || '').trim();
  if (!s) return '';
  var limit = typeof max === 'number' ? max : 72;
  return s.length > limit ? s.slice(0, limit) + '…' : s;
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(String(text || ''));
}

function looksLikeRawRoomPayload(text) {
  var t = String(text || '').trim();
  if (!t) return false;
  if (t.charAt(0) === '{' || t.charAt(0) === '[') return true;
  if (/^\[?\s*\{/.test(t)) return true;
  if (t.indexOf('[object Object]') >= 0) return true;
  if (t.indexOf('roomId') >= 0 || t.indexOf('roomName') >= 0) return true;
  if (t.indexOf('&quot;') >= 0 && (t.indexOf('roomId') >= 0 || t.indexOf('roomName') >= 0)) return true;
  return false;
}

function looksLikeTechnicalRoomId(text) {
  var t = String(text || '').trim();
  if (!t || hasCjk(t)) return false;
  if (looksLikeRawRoomPayload(t)) return true;
  return /^[A-Za-z0-9_\-./]+$/.test(t) && t.length >= 6;
}

function extractRoomNameFromEntry(item) {
  if (item == null) return '';
  if (typeof item === 'string') {
    var s = item.trim();
    if (!s || looksLikeRawRoomPayload(s)) return '';
    return looksLikeTechnicalRoomId(s) ? '' : s;
  }
  if (typeof item === 'object') {
    var name = item.roomName || item.name || item.title;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return '';
}

function dedupeStrings(list) {
  var out = [];
  var seen = {};
  for (var i = 0; i < (list || []).length; i += 1) {
    var v = String(list[i] || '').trim();
    if (!v || seen[v]) continue;
    seen[v] = true;
    out.push(v);
  }
  return out;
}

function extractRoomNamesFromJsonish(text) {
  var out = [];
  var re = /"roomName"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      out.push(String(m[1]).replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim());
    }
  }
  return dedupeStrings(out);
}

function parseRoomSegment(segment) {
  var seg = String(segment || '').trim();
  if (!seg) return [];
  if (seg.charAt(0) === '[') {
    return exemptUtil.parseExemptRoomNames(seg)
      .map(function (name) { return looksLikeTechnicalRoomId(name) ? '' : name; })
      .filter(Boolean);
  }
  if (seg.charAt(0) === '{') {
    try {
      var one = extractRoomNameFromEntry(JSON.parse(seg));
      return one ? [one] : [];
    } catch (e) {
      return extractRoomNamesFromJsonish(seg);
    }
  }
  if (looksLikeRawRoomPayload(seg)) {
    return extractRoomNamesFromJsonish(seg);
  }
  return looksLikeTechnicalRoomId(seg) ? [] : [seg];
}

/** 将授权房间原始值（JSON/ID/脏 HTML 文本）转为可读房间名，用顿号连接 */
function normalizeExemptRoomDisplay(raw) {
  var text = decodeHtmlEntitiesIfNeeded(String(raw || '')).trim();
  if (!text) return '';

  if (text.charAt(0) === '[') {
    var fromArray = exemptUtil.parseExemptRoomNames(text)
      .map(function (name) { return looksLikeTechnicalRoomId(name) ? '' : name; })
      .filter(Boolean);
    if (fromArray.length) return dedupeStrings(fromArray).join('、');
  }

  if (looksLikeRawRoomPayload(text)) {
    var fromJsonish = extractRoomNamesFromJsonish(text);
    if (fromJsonish.length) return fromJsonish.join('、');
  }

  var segments = text.split(/[、,，；;]/).map(function (s) { return s.trim(); }).filter(Boolean);
  var names = [];
  for (var i = 0; i < segments.length; i += 1) {
    var parsed = parseRoomSegment(segments[i]);
    for (var j = 0; j < parsed.length; j += 1) {
      if (parsed[j]) names.push(parsed[j]);
    }
  }
  names = dedupeStrings(names);
  if (names.length) return names.join('、');

  if (looksLikeRawRoomPayload(text) || looksLikeTechnicalRoomId(text)) return '';
  return text;
}

function escapeHtmlLite(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildExemptDisplayHtml(fields) {
  var f = fields || {};
  var html = [];
  if (f.modeLabel) html.push('<p>豁免模式：' + escapeHtmlLite(f.modeLabel) + '</p>');
  if (f.expireAt) html.push('<p>有效期至：' + escapeHtmlLite(f.expireAt) + '</p>');
  if (f.remainingCount) html.push('<p>剩余次数：' + escapeHtmlLite(f.remainingCount) + '</p>');
  if (f.roomNames) {
    html.push('<p>授权房间：' + escapeHtmlLite(f.roomNames) + '</p>');
  } else if (f.roomCount) {
    html.push('<p>授权房间数：' + escapeHtmlLite(f.roomCount) + '</p>');
  } else if (f.scopeText) {
    html.push('<p>' + escapeHtmlLite(f.scopeText) + '</p>');
  }
  return html.join('');
}

function parseExemptFieldsFromPlain(plain) {
  var text = String(plain || '').trim();
  var modeMatch = text.match(/免冻结豁免[^（]*（([^）]+)）/);
  var expireMatch = text.match(/有效期至\s*[:：]\s*([^\s]+(?:\s+[^\s]+)?)/);
  var countMatch = text.match(/剩余次数\s*[:：]\s*([^授权]+?)(?=授权|$)/);
  var roomsMatch = text.match(/授权房间\s*[:：]\s*(.+)/);
  var roomCountMatch = text.match(/授权房间数\s*[:：]\s*(\d+)/);
  var scopeMatch = text.match(/授权范围\s*[:：]\s*(.+)/);
  var rawRooms = roomsMatch ? roomsMatch[1].trim() : '';
  var roomNames = normalizeExemptRoomDisplay(rawRooms);
  var roomCount = roomCountMatch ? roomCountMatch[1].trim() : '';
  if (!roomNames && rawRooms && looksLikeRawRoomPayload(rawRooms)) {
    var inferred = parseRoomSegment(rawRooms);
    if (!inferred.length && !roomCount) {
      roomCount = String(Math.max(1, (rawRooms.match(/roomId/g) || []).length));
    }
  }
  return {
    modeLabel: modeMatch ? modeMatch[1].trim() : '',
    expireAt: expireMatch ? expireMatch[1].trim() : '',
    remainingCount: countMatch ? countMatch[1].trim() : '',
    roomNames: roomNames,
    roomCount: roomCount,
    scopeText: scopeMatch ? scopeMatch[1].trim() : '',
  };
}

function parseExemptFields(item) {
  return parseExemptFieldsFromPlain(stripHtmlPreview(normalizeContentHtml(item && item.contentHtml)));
}

function buildExemptSummaryLines(fields) {
  var f = fields || {};
  var line1Parts = [];
  if (f.modeLabel) line1Parts.push(f.modeLabel);
  if (f.expireAt) line1Parts.push('有效期至 ' + f.expireAt);
  if (f.remainingCount) line1Parts.push('剩余 ' + f.remainingCount);
  var line2 = '';
  if (f.roomNames) {
    line2 = '授权房间：' + f.roomNames;
  } else if (f.roomCount) {
    line2 = '授权房间数：' + f.roomCount;
  } else if (f.scopeText) {
    line2 = f.scopeText;
  }
  return {
    line1: line1Parts.join(' · '),
    line2: line2,
  };
}

function buildExemptPreview(fields) {
  var lines = buildExemptSummaryLines(fields);
  if (lines.line1 && lines.line2) return lines.line1 + ' · ' + lines.line2;
  return lines.line1 || lines.line2 || '非开放时段可扫码进入授权房间';
}

function resolveAlertStatus(item) {
  var s = String(item && item.status || '').toUpperCase();
  if (s === 'APPROVED' || s === 'FULFILLED' || s === 'RECEIVED' || s === 'APPROVED_ACTIVE') {
    return statusStyle('已通过', 'approved');
  }
  if (s === 'REJECTED' || s === 'DENIED') {
    return statusStyle('已拒绝', 'rejected');
  }
  if (s === 'PENDING' || s === 'PENDING_REVIEW' || s === 'FIRST_OK') {
    return statusStyle('待审核', 'pending');
  }

  var html = normalizeContentHtml(item && item.contentHtml);
  var t = String(item && item.title || '') + html;
  t = t.toLowerCase();
  if (t.indexOf('拒绝') >= 0 || t.indexOf('驳回') >= 0 || t.indexOf('未通过') >= 0) {
    return statusStyle('已拒绝', 'rejected');
  }
  if (t.indexOf('通过') >= 0 || t.indexOf('批准') >= 0 || t.indexOf('已授权') >= 0 || t.indexOf('已出库') >= 0) {
    return statusStyle('已通过', 'approved');
  }
  if (t.indexOf('待审核') >= 0 || t.indexOf('审核中') >= 0) {
    return statusStyle('待审核', 'pending');
  }
  return statusStyle('', 'default');
}

function statusStyle(label, tone) {
  var map = {
    approved: { statusBg: '#dcfce7', statusColor: '#16a34a' },
    rejected: { statusBg: '#fee2e2', statusColor: '#dc2626' },
    pending: { statusBg: '#fef3c7', statusColor: '#a16207' },
    default: { statusBg: '', statusColor: '' },
  };
  var st = map[tone] || map.default;
  return {
    label: label,
    tone: tone,
    statusBg: st.statusBg,
    statusColor: st.statusColor,
  };
}

function looksLikeBizOrOrderId(text, item) {
  var t = String(text || '').trim();
  if (!t) return true;
  if (item && item.bizId != null && String(item.bizId).trim() === t) return true;
  if (/^MR\d{8,}$/i.test(t)) return true;
  if (/^SNF_[A-F0-9]{8,}$/i.test(t)) return true;
  if (/^NTF_[A-Z0-9_]{8,}$/i.test(t)) return true;
  if (!hasCjk(t) && /^[A-Za-z0-9_\-./]{6,32}$/.test(t)) return true;
  return false;
}

function isMaterialStatusOnlyTitle(text) {
  var t = String(text || '').trim();
  return t === '物资申领'
    || /^物资申领(审核中|已拒绝|已通过)$/.test(t)
    || /^(已通过|已拒绝|待审核|审核中)$/.test(t);
}

function isScanDelayStatusOnlyTitle(text) {
  var t = String(text || '').trim();
  return t === '延迟申请'
    || /^延迟申请(审核中|已通过|已拒绝)$/.test(t);
}

/** 剥离标题中孤立的「原因：」等空标签后缀 */
function stripTrailingReasonSuffix(text) {
  return String(text || '')
    .replace(/\s*(?:拒绝)?原因\s*[:：]\s*[\s·•,，、]*$/g, '')
    .replace(/\s*[·•,，、]+\s*$/g, '')
    .trim();
}

/** 从 contentHtml 按段落提取纯文本（保留 strong 标记） */
function extractParagraphTexts(html) {
  var text = normalizeContentHtml(html);
  if (!text) return [];
  var lines = [];
  var re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  var m;
  while ((m = re.exec(text)) !== null) {
    var inner = m[1];
    var plain = stripHtmlPreview(inner).trim();
    if (!plain) continue;
    lines.push({
      text: plain,
      strong: /<strong[^>]*>/i.test(inner),
    });
  }
  if (lines.length) return lines;
  var plainAll = stripHtmlPreview(text).trim();
  if (!plainAll) return [];
  return plainAll.split(/\n+/).map(function (s) {
    return { text: s.trim(), strong: false };
  }).filter(function (x) { return x.text; });
}

function isScanDelayDetailLine(text) {
  var t = String(text || '').trim();
  if (!t) return true;
  if (/^延迟至\s*[:：]/.test(t)) return true;
  if (/^(已授予|等待教职工|申请未通过|拒绝原因|审核未通过|审核已通过|已出库)/.test(t)) return true;
  return isScanDelayStatusOnlyTitle(t);
}

/** 审核状态文案仅由角标展示；用于旧版纯文本兜底，避免留下孤立「原因：」 */
function stripFeedbackStatusPhrases(text) {
  return stripTrailingReasonSuffix(
    String(text || '')
      .replace(/拒绝原因\s*[:：]\s*(?:已通过|已批准|已授权|已拒绝|已驳回|待审核|审核中|审核通过|审核未通过|未通过)\s*/g, '')
      .replace(/申领物品/g, '')
      .replace(/等待教职工审核[。.]?/g, '')
      .replace(/审核未通过[^。]*[。]?/g, '')
      .replace(/审核已通过[^。]*[。]?/g, '')
      .replace(/已出库[^。]*[。]?/g, '')
      .replace(/如有疑问[^。]*[。]?/g, '')
      .replace(/申请未通过[。.]?/g, '')
      .replace(/已授予免冻结豁免[。.]?/g, '')
      .replace(/(已通过|已批准|已授权|已拒绝|已驳回|待审核|审核中|审核通过|审核未通过|未通过)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

function parseMaterialLinesFromHtml(html) {
  var text = normalizeContentHtml(html);
  if (!text) return [];
  var lines = [];
  var re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  var m;
  while ((m = re.exec(text)) !== null) {
    var raw = stripHtmlPreview(m[1]).trim();
    if (!raw || looksLikeBizOrOrderId(raw, null)) continue;
    var qtyMatch = raw.match(/^(.+?)\s*[×xX]\s*(\d+)\s*(?:（([\s\S]+?)）)?$/);
    if (qtyMatch) {
      lines.push({
        name: qtyMatch[1].trim(),
        qty: Number(qtyMatch[2]) || 0,
        spec: qtyMatch[3] ? qtyMatch[3].trim() : '',
      });
      continue;
    }
    var specMatch = raw.match(/^(.+?)（([\s\S]+?)）$/);
    if (specMatch) {
      lines.push({ name: specMatch[1].trim(), qty: 0, spec: specMatch[2].trim() });
      continue;
    }
    lines.push({ name: raw, qty: 0, spec: '' });
  }
  if (lines.length) return lines;
  var plain = stripHtmlPreview(text).trim();
  var outboundMatch = plain.match(/已出库[：:]\s*(.+)/);
  if (outboundMatch && outboundMatch[1]) {
    outboundMatch[1].split(/[、,，]/).forEach(function (part) {
      var name = String(part || '').trim();
      if (name && !looksLikeBizOrOrderId(name, null)) {
        lines.push({ name: name, qty: 0, spec: '' });
      }
    });
  }
  return lines;
}

function formatMaterialLineLabel(line) {
  if (!line || !line.name) return '';
  var label = line.name;
  if (line.qty > 0) label += ' × ' + line.qty;
  if (line.spec) label += '（' + line.spec + '）';
  return label;
}

function parseMaterialMessageFromHtml(html) {
  var text = normalizeContentHtml(html);
  if (!text) return '';
  var parts = text.split(/<\/ul>/i);
  if (parts.length > 1) {
    var tail = stripHtmlPreview(parts[parts.length - 1]).trim();
    if (tail) return tail;
  }
  var paragraphs = extractParagraphTexts(html);
  for (var i = 0; i < paragraphs.length; i += 1) {
    var t = paragraphs[i].text;
    if (t === '申领物品' || paragraphs[i].strong) continue;
    if (!/<ul/i.test(text)) return t;
  }
  return '';
}

function resolveMaterialFeedbackTitleFromStatus(item) {
  var status = resolveAlertStatus(item);
  if (status.label === '已拒绝') return '物资申领已拒绝';
  if (status.label === '已通过') return '物资申领已通过';
  if (status.label === '待审核') return '物资申领审核中';
  return '物资申领';
}

function buildMaterialFeedbackSummary(item) {
  var lines = parseMaterialLinesFromHtml(item && item.contentHtml);
  var formatted = [];
  for (var i = 0; i < lines.length; i += 1) {
    var label = formatMaterialLineLabel(lines[i]);
    if (label) formatted.push(label);
  }
  var statusMessage = parseMaterialMessageFromHtml(item && item.contentHtml);
  var bodyLine1 = '';
  var bodyLine2 = '';
  if (formatted.length) {
    if (formatted.length <= 2) {
      bodyLine1 = formatted.join(' · ');
    } else {
      var mid = Math.ceil(formatted.length / 2);
      bodyLine1 = formatted.slice(0, mid).join(' · ');
      bodyLine2 = formatted.slice(mid).join(' · ');
    }
  }
  if (statusMessage) {
    if (bodyLine2) {
      bodyLine2 = bodyLine2 + ' · ' + statusMessage;
    } else if (bodyLine1) {
      bodyLine2 = statusMessage;
    } else {
      bodyLine1 = statusMessage;
    }
  }
  return {
    titleLine: resolveMaterialFeedbackTitleFromStatus(item),
    bodyLine1: bodyLine1,
    bodyLine2: bodyLine2,
    lines: lines,
    formatted: formatted,
    statusMessage: statusMessage,
  };
}

function buildScanDelaySummary(item) {
  var paragraphs = extractParagraphTexts(item && item.contentHtml);
  var room = '';
  var description = '';
  var detailLines = [];
  var i;
  for (i = 0; i < paragraphs.length; i += 1) {
    var p = paragraphs[i];
    var t = p.text;
    if (!t || looksLikeBizOrOrderId(t, item)) continue;
    if (p.strong && !room) {
      room = t;
      continue;
    }
    if (!description && !p.strong && !isScanDelayDetailLine(t)) {
      description = t;
      continue;
    }
    if (isScanDelayDetailLine(t)) {
      detailLines.push(t);
    }
  }
  if (!room && paragraphs.length) {
    for (i = 0; i < paragraphs.length; i += 1) {
      if (paragraphs[i].strong) {
        room = paragraphs[i].text;
        break;
      }
    }
  }
  if (!description) {
    for (i = 0; i < paragraphs.length; i += 1) {
      var candidate = paragraphs[i].text;
      if (!paragraphs[i].strong && candidate !== room && !isScanDelayDetailLine(candidate)) {
        description = candidate;
        break;
      }
    }
  }
  var titleParts = [];
  if (description) titleParts.push(description);
  if (room) titleParts.push(room);
  var titleLine = stripTrailingReasonSuffix(titleParts.join(' · '));

  var bodyParts = [];
  if (room) bodyParts.push(room);
  if (description) bodyParts.push(description);
  for (i = 0; i < detailLines.length; i += 1) {
    bodyParts.push(detailLines[i]);
  }
  bodyParts = dedupeStrings(bodyParts);

  var bodyLine1 = '';
  var bodyLine2 = '';
  if (bodyParts.length <= 2) {
    bodyLine1 = bodyParts.join(' · ');
  } else if (bodyParts.length > 0) {
    var mid = Math.ceil(bodyParts.length / 2);
    bodyLine1 = bodyParts.slice(0, mid).join(' · ');
    bodyLine2 = bodyParts.slice(mid).join(' · ');
  }
  return { titleLine: titleLine, bodyLine1: bodyLine1, bodyLine2: bodyLine2 };
}

function resolveMaterialFeedbackTitle(item) {
  var rawTitle = String(item && item.title || '').trim();
  if (rawTitle && /^物资申领(审核中|已拒绝|已通过)$/.test(rawTitle)) {
    return rawTitle;
  }
  var summary = buildMaterialFeedbackSummary(item);
  if (summary.titleLine) return summary.titleLine;
  var cleaned = stripTrailingReasonSuffix(cleanAlertTitle(item && item.title, 'material_feedback', null));
  if (!isMaterialStatusOnlyTitle(cleaned) && !looksLikeBizOrOrderId(cleaned, item) && cleaned !== '物资申领') {
    return cleaned;
  }
  return resolveMaterialFeedbackTitleFromStatus(item);
}

function resolveScanDelayFeedbackTitle(item) {
  var summary = buildScanDelaySummary(item);
  if (summary.titleLine && !isScanDelayStatusOnlyTitle(summary.titleLine)) {
    return stripTrailingReasonSuffix(summary.titleLine);
  }
  var cleaned = stripTrailingReasonSuffix(cleanAlertTitle(item && item.title, 'scan_delay_feedback', null));
  if (!isScanDelayStatusOnlyTitle(cleaned) && !looksLikeBizOrOrderId(cleaned, item) && cleaned !== '延迟申请') {
    return cleaned;
  }
  return '延迟申请';
}

function cleanAlertTitle(title, kind, status) {
  var t = String(title || '');
  t = t.replace(/申领单\s*[#＃]?\s*\w+/gi, '');
  t = t.replace(/申请号\s*[#＃]?\s*\w+/gi, '');
  t = t.replace(/单号\s*[#＃]?\s*\w+/gi, '');
  t = t.replace(/\bMR\d{8,}\b/gi, '');
  t = t.replace(/\b[A-Z0-9]{10,}\b/g, '');
  if (status && status.label) {
    t = t.replace(/[，,]?\s*(已通过|已批准|已授权|已拒绝|已驳回|待审核|审核中|审核通过|审核未通过|未通过)/g, '');
  }
  t = t.replace(/^[，,、\s]+/, '').replace(/[，,、\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
  if (t && !looksLikeBizOrOrderId(t, null)) return t;
  if (kind === 'material_feedback') return '物资申领';
  if (kind === 'scan_delay_feedback') return '延迟申请';
  if (kind === 'exempt') return '免冻结豁免';
  if (kind === 'violation') return '违规提醒';
  return title || '通知';
}

function buildAlertPreview(item, title, status) {
  var kind = String(item && item.kind || '');
  var html = normalizeContentHtml(item && item.contentHtml);

  if (kind === 'exempt') {
    return buildExemptPreview(parseExemptFieldsFromPlain(stripHtmlPreview(html)));
  }

  if (kind === 'material_feedback') {
    var materialSummary = buildMaterialFeedbackSummary(item);
    if (materialSummary.bodyLine1 && materialSummary.bodyLine2) {
      return truncateText(materialSummary.bodyLine1 + ' · ' + materialSummary.bodyLine2, 72);
    }
    if (materialSummary.bodyLine1) return truncateText(materialSummary.bodyLine1, 72);
    return '';
  }

  if (kind === 'scan_delay_feedback') {
    var delaySummary = buildScanDelaySummary(item);
    if (delaySummary.bodyLine1 && delaySummary.bodyLine2) {
      return truncateText(delaySummary.bodyLine1 + ' · ' + delaySummary.bodyLine2, 72);
    }
    if (delaySummary.bodyLine1) return truncateText(delaySummary.bodyLine1, 72);
    return '';
  }

  var plain = stripHtmlPreview(
    kind === 'violation' ? extractViolationBodyForDisplay(html) : html
  );
  if (kind === 'violation') {
    plain = plain.replace(/来源\s*[:：].+$/gim, '').replace(/时间\s*[:：].+$/gim, '').trim();
  }
  if (status && status.label) {
    plain = plain.replace(/(已通过|已批准|已授权|已拒绝|已驳回|待审核|审核中|审核通过|审核未通过|未通过)/g, '').trim();
  }
  plain = plain.replace(/\s{2,}/g, ' ').trim();
  if (plain && looksLikeBizOrOrderId(plain, item)) plain = '';
  if (plain && plain !== title && title.indexOf(plain) < 0) {
    return truncateText(plain, 72);
  }
  if (kind === 'violation') return '请查看违规详情';
  return '';
}

function prepareAlertBodyHtml(item) {
  var kind = String(item && item.kind || '');
  var html = normalizeContentHtml(item && item.contentHtml);
  if (kind === 'violation') {
    return extractViolationBodyForDisplay(html);
  }
  if (kind === 'exempt') {
    return buildExemptDisplayHtml(parseExemptFields(item));
  }
  return html;
}

/** 消息通知列表/置顶卡片视图模型 */
function decoratePersonalAlertItem(item) {
  var kind = String(item && item.kind || 'announcement');
  var colors = kindColors(kind);
  var important = isImportantReminderKind(kind);
  var badge = important ? importantReminderColors() : colors;
  var status = resolveAlertStatus(item);
  var title = kind === 'material_feedback'
    ? resolveMaterialFeedbackTitle(item)
    : (kind === 'scan_delay_feedback'
      ? resolveScanDelayFeedbackTitle(item)
      : cleanAlertTitle(item && item.title, kind, status));
  var preview = buildAlertPreview(item, title, status);
  var summaryLine1 = '';
  var summaryLine2 = '';

  if (kind === 'exempt') {
    title = '免冻结豁免';
    var exemptLines = buildExemptSummaryLines(parseExemptFields(item));
    summaryLine1 = exemptLines.line1;
    summaryLine2 = exemptLines.line2;
    if (!preview && (summaryLine1 || summaryLine2)) {
      preview = buildExemptPreview(parseExemptFields(item));
    }
  } else if (kind === 'material_feedback') {
    var materialSummary = buildMaterialFeedbackSummary(item);
    summaryLine1 = materialSummary.bodyLine1;
    summaryLine2 = materialSummary.bodyLine2;
    if (!preview && (summaryLine1 || summaryLine2)) {
      preview = buildAlertPreview(item, title, status);
    }
  } else if (kind === 'scan_delay_feedback') {
    var delaySummary = buildScanDelaySummary(item);
    summaryLine1 = delaySummary.bodyLine1;
    summaryLine2 = delaySummary.bodyLine2;
    if (!preview && (summaryLine1 || summaryLine2)) {
      preview = buildAlertPreview(item, title, status);
    }
  }

  return {
    id: item.id,
    kind: kind,
    title: title,
    preview: preview,
    summaryLine1: summaryLine1,
    summaryLine2: summaryLine2,
    badgeLabel: important ? '重要提醒' : kindLabel(kind),
    badgeBg: badge.bg,
    badgeColor: badge.color,
    time: formatTime(item.publishAt || item.createdAt || ''),
    isRead: item.isRead !== false,
    isImportantReminder: important,
    statusLabel: status.label,
    statusTone: status.tone,
    statusBg: status.statusBg,
    statusColor: status.statusColor,
    cardBg: important ? 'rgba(172,23,54,0.04)' : '#ffffff',
    cardBorder: important ? 'rgba(172,23,54,0.22)' : 'rgba(30,55,90,0.08)',
  };
}

function mergeAlertItems(data) {
  if (!data || typeof data !== 'object') return [];
  var announcements = Array.isArray(data.announcements) ? data.announcements : [];
  var feedbacks = Array.isArray(data.feedbacks) ? data.feedbacks : [];
  var items = announcements.concat(feedbacks);
  if (items.length === 0 && Array.isArray(data.items)) items = data.items.slice();
  return items;
}

/** 首页公告区：仅扫码弹窗公告 */
function extractScanPopupBulletins(data) {
  var announcements = Array.isArray(data && data.announcements) ? data.announcements : [];
  return announcements.filter(function (item) {
    return isScanPopupBulletinKind(item.kind);
  });
}

/** 消息页：豁免/违规 + 审核反馈，不含扫码弹窗公告 */
function extractPersonalAlerts(data) {
  if (!data || typeof data !== 'object') return [];
  var announcements = Array.isArray(data.announcements) ? data.announcements : [];
  var feedbacks = Array.isArray(data.feedbacks) ? data.feedbacks : [];
  var personal = announcements.filter(function (item) {
    return item.kind === 'exempt' || item.kind === 'violation';
  }).concat(feedbacks);
  return sortAlertsForDisplay(personal);
}

function sortAlertsForDisplay(items) {
  return (items || []).slice().sort(function (a, b) {
    var pa = alertDisplayPriority(a.kind);
    var pb = alertDisplayPriority(b.kind);
    if (pa !== pb) return pa - pb;
    var ta = a.publishAt || a.createdAt || '';
    var tb = b.publishAt || b.createdAt || '';
    return String(tb).localeCompare(String(ta));
  });
}

function formatBulletinSubtitle(item) {
  var date = String(item.publishAt || item.createdAt || '').slice(0, 10);
  var plain = stripHtmlPreview(item.contentHtml || '');
  var title = String(item.title || '').trim();
  var preview = '';
  if (plain && plain !== title && title.indexOf(plain) < 0) {
    preview = plain.length > 36 ? plain.slice(0, 36) + '…' : plain;
  }
  if (preview && date) return date + ' · ' + preview;
  if (date) return date;
  return formatTime(item.publishAt || item.createdAt || '');
}

function decorateBulletinListItem(item) {
  var colors = kindColors('announcement');
  return {
    id: item.id,
    kind: item.kind || 'announcement',
    title: item.title || '',
    subtitle: formatBulletinSubtitle(item),
    badgeLabel: '公告',
    badgeBg: colors.bg,
    badgeColor: colors.color,
    isImportantReminder: false,
  };
}

function buildHomeBulletinPreviewList(data, limit) {
  var max = typeof limit === 'number' ? limit : 4;
  var announcements = Array.isArray(data && data.announcements) ? data.announcements : [];
  var merged = [];
  var i;
  for (i = 0; i < announcements.length; i += 1) {
    var item = announcements[i];
    if (item.kind === 'exempt' || item.kind === 'violation' || isScanPopupBulletinKind(item.kind)) {
      merged.push(item);
    }
  }
  return sortAlertsForDisplay(merged)
    .slice(0, max)
    .map(function (item) {
      if (isScanPopupBulletinKind(item.kind)) {
        return decorateBulletinListItem(item);
      }
      var decorated = decoratePersonalAlertItem(item);
      return {
        id: decorated.id,
        kind: decorated.kind,
        title: decorated.title,
        subtitle: decorated.preview || decorated.summaryLine1 || decorated.time,
        badgeLabel: decorated.badgeLabel,
        badgeBg: decorated.badgeBg,
        badgeColor: decorated.badgeColor,
        isImportantReminder: decorated.isImportantReminder,
      };
    });
}

function findStudentAlertByIdKind(items, id, kind) {
  var sid = String(id);
  var sk = String(kind || '');
  var i;
  for (i = 0; i < items.length; i += 1) {
    var it = items[i];
    if (String(it.kind) === sk && String(it.id) === sid) return it;
  }
  if (sk === 'exempt') {
    for (i = 0; i < items.length; i += 1) {
      if (String(items[i].kind) === 'exempt') return items[i];
    }
  }
  return null;
}

function countUnread(items) {
  var n = 0;
  for (var i = 0; i < (items || []).length; i += 1) {
    if (items[i].isRead === false) n += 1;
  }
  return n;
}

function unreadBadgeText(data) {
  var items = extractPersonalAlerts(data);
  var n = countUnread(items);
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

function fetchStudentAlerts() {
  return springAuth.springRequest({
    url: '/api/student/mobile/alerts',
    method: 'GET',
    data: {},
  }).then(function (res) {
    if (res.statusCode !== 200) {
      throw new Error('加载失败(' + (res.statusCode || 0) + ')');
    }
    var body = parseBody(res.data);
    if (!body || !body.success) {
      throw new Error((body && body.message) || '加载失败');
    }
    return body.data || {};
  });
}

function fetchStudentAlertDetail(id, kind) {
  return fetchStudentAlerts().then(function (data) {
    var item = findStudentAlertByIdKind(mergeAlertItems(data), id, kind);
    if (!item) throw new Error('通知不存在或已过期');
    return item;
  });
}

function fetchScanPopupBulletinDetail(id, kind) {
  return fetchStudentAlerts().then(function (data) {
    var item = findStudentAlertByIdKind(extractScanPopupBulletins(data), id, kind || 'announcement');
    if (!item) throw new Error('公告不存在或已过期');
    return item;
  });
}

module.exports = {
  isScanPopupBulletinKind: isScanPopupBulletinKind,
  isPersonalAlertKind: isPersonalAlertKind,
  isStudentMobileAlertKind: isStudentMobileAlertKind,
  isImportantReminderKind: isImportantReminderKind,
  kindLabel: kindLabel,
  kindColors: kindColors,
  importantReminderColors: importantReminderColors,
  formatTime: formatTime,
  decodeHtmlEntitiesIfNeeded: decodeHtmlEntitiesIfNeeded,
  normalizeContentHtml: normalizeContentHtml,
  extractViolationBodyForDisplay: extractViolationBodyForDisplay,
  stripHtmlPreview: stripHtmlPreview,
  normalizeExemptRoomDisplay: normalizeExemptRoomDisplay,
  prepareAlertBodyHtml: prepareAlertBodyHtml,
  decoratePersonalAlertItem: decoratePersonalAlertItem,
  mergeAlertItems: mergeAlertItems,
  extractScanPopupBulletins: extractScanPopupBulletins,
  extractPersonalAlerts: extractPersonalAlerts,
  sortAlertsForDisplay: sortAlertsForDisplay,
  decorateBulletinListItem: decorateBulletinListItem,
  buildHomeBulletinPreviewList: buildHomeBulletinPreviewList,
  findStudentAlertByIdKind: findStudentAlertByIdKind,
  countUnread: countUnread,
  unreadBadgeText: unreadBadgeText,
  fetchStudentAlerts: fetchStudentAlerts,
  fetchStudentAlertDetail: fetchStudentAlertDetail,
  fetchScanPopupBulletinDetail: fetchScanPopupBulletinDetail,
};
