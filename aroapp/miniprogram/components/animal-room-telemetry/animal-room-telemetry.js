/** 与 Web formatTelemetryTs 一致 */
const springAuth = require('../../utils/springAuth.js');
const animalRoomHvacUnits = require('../../utils/animalRoomHvacUnits.js');

function formatTelemetryTs(iso) {
  if (iso == null || iso === '') return '—';
  const s = typeof iso === 'string' ? iso : String(iso);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleString();
}

function pickTrim(v) {
  if (v == null) return '';
  return String(v).trim();
}

/** 半角连字符、全角横线、en/em dash、减号等，用于定位「最后一个分段」 */
function isHyphenLikeChar(ch) {
  if (!ch || ch.length !== 1) return false;
  const c = ch.charCodeAt(0);
  return (
    ch === '-' ||
    c === 0xff0d ||
    c === 0x2013 ||
    c === 0x2014 ||
    c === 0x2212 ||
    c === 0x2011
  );
}

/**
 * 去掉最后一个横线类字符及其后的后缀（如 …-温度设定）；横线在首位则不截。
 */
function stripSetpointMapTailAfterLastDash(text) {
  const s = pickTrim(text);
  if (!s) return '';
  let idx = -1;
  for (let i = s.length - 1; i >= 0; i--) {
    if (isHyphenLikeChar(s[i])) {
      idx = i;
      break;
    }
  }
  if (idx <= 0) return s;
  const head = s.slice(0, idx).trimEnd();
  return head.length > 0 ? head : s;
}

/** 设定值弹窗副文案：一行映射名（已截去最后一个 "-" 后段）；无映射名时用指标类型兜底 */
function formatSetpointParamHintLine(displayLabel, mkl, mkc) {
  const dl = pickTrim(displayLabel);
  const lab = pickTrim(mkl) || pickTrim(mkc);
  if (dl) return stripSetpointMapTailAfterLastDash(dl);
  if (lab) return stripSetpointMapTailAfterLastDash(lab);
  return '';
}

/** 映射名过长时分级缩小字号，尽量单行内展示完整文案 */
function setpointMapHintFontTier(text) {
  const len = pickTrim(text).length;
  if (len <= 18) return '';
  if (len <= 30) return '--sm';
  if (len <= 44) return '--xs';
  return '--xxs';
}

/** 与 Web stripSuiteTitlePrefixForDisplay 一致：去掉行首「套间」+ 可选 ·/• */
function stripSuiteTitlePrefixForDisplayMp(title) {
  const s = pickTrim(title);
  if (!s) return s;
  const stripped = s.replace(/^套间\s*(?:[·•]\s*)?/, '').trim();
  return stripped.length > 0 ? stripped : s;
}

function findTagItemByVariableName(items, vn) {
  const want = pickTrim(vn);
  if (!want || !Array.isArray(items)) return null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it && pickTrim(it.variableName) === want) return it;
  }
  return null;
}

/** 轮询/重挂载后按 tabKey 恢复楼层；fallback 索引须同步更新（见 _lastStableTabIndex），避免 setData 未落地时仍读到 activeTabIndex=0 先闪第一层楼 */
const MP_ANIMAL_ROOM_TELEMETRY_TAB_KEY = 'mp_animal_room_telemetry_floor_tab_key';

function readStoredAnimalRoomTelemetryTabKey() {
  try {
    return pickTrim(wx.getStorageSync(MP_ANIMAL_ROOM_TELEMETRY_TAB_KEY));
  } catch (e) {
    return '';
  }
}

function writeStoredAnimalRoomTelemetryTabKey(tabKey) {
  const k = pickTrim(tabKey);
  if (!k) return;
  try {
    wx.setStorageSync(MP_ANIMAL_ROOM_TELEMETRY_TAB_KEY, k);
  } catch (e) {
    /* ignore */
  }
}

function resolveAnimalRoomTelemetryFloorIndex(tabs, fallbackIndex, preferredTabKey) {
  const list = Array.isArray(tabs) ? tabs : [];
  const n = list.length;
  if (!n) return 0;
  const pk = pickTrim(preferredTabKey);
  if (pk) {
    const pl = pk.toLowerCase();
    const fi = list.findIndex((t) => pickTrim(t && t.tabKey).toLowerCase() === pl);
    if (fi >= 0) return fi;
  }
  const p = Number(fallbackIndex);
  const fb = Number.isFinite(p) ? p : 0;
  return Math.min(Math.max(0, fb), n - 1);
}

/** 写入/合并单行后刷新视图时锁定当前楼层侧栏（避免 preferred 与 storage 短暂不一致回到 1F） */
function getPreserveFloorTabKey(self) {
  const st = self.data.structTabs || [];
  const ai = Number(self.data.activeTabIndex);
  const fromBar =
    Number.isFinite(ai) && ai >= 0 && st[ai] ? pickTrim(st[ai].tabKey) : '';
  return (
    fromBar ||
    pickTrim(self._lastAppliedFloorTabKey) ||
    pickTrim(self._preferredFloorTabKey) ||
    readStoredAnimalRoomTelemetryTabKey()
  );
}

function applyWinccWriteRowToPage(page, row) {
  if (!page || !Array.isArray(page.tagItems) || !row || !pickTrim(row.variableName)) return;
  const vnx = pickTrim(row.variableName);
  page.tagItems = page.tagItems.map((it) =>
    pickTrim(it.variableName) === vnx ? Object.assign({}, it, row) : it
  );
}

/**
 * WinCC 设定值写入：不阻塞「提交中」；后台按间隔拉 snapshot(sync) 直至读回一致再合并单行（post-save-no-full-refresh.mdc）。
 */
function winccWriteThenApply(self, vn, valueText) {
  const api = require('../../utils/animalRoomTelemetryApi.js');
  const t = pickTrim(valueText);
  if (!t) {
    wx.showToast({ title: '请输入数值', icon: 'none' });
    return Promise.reject(new Error('empty'));
  }
  const preserveTabKey = getPreserveFloorTabKey(self);
  const prev =
    findTagItemByVariableName((self._telemetryPage && self._telemetryPage.tagItems) || [], pickTrim(vn)) ||
    {};
  const kindRole = pickTrim(prev.kindRole) || 'SETPOINT';

  return api
    .writeWinccTagAndVerify(vn, t, kindRole)
    .then((row) => {
      applyWinccWriteRowToPage(self._telemetryPage, row);
      wx.showToast({ title: '修改成功', icon: 'success' });
      self.applyTelemetryPage(self._telemetryPage, { preserveTabKey });
      return row;
    })
    .catch((err) => {
      wx.showToast({ title: (err && err.message) || '写入失败', icon: 'none' });
      return Promise.reject(err);
    });
}

function formatFetchedAt(v) {
  if (v == null) return '—';
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toLocaleString();
    return v;
  }
  return String(v);
}

/** B 层 E 区 Tab：与产品约定简称（仅小程序顶栏；Web 仍用完整 tabKey/title） */
function basementPartitionTabLabel(tabKey) {
  const k = pickTrim(tabKey).toUpperCase();
  const m = k.match(/^B\d+F-(E10|E11A|E11B|E11C)$/);
  if (!m) return null;
  const suf = m[1];
  if (suf === 'E10') return 'E10';
  if (suf === 'E11A') return 'A区';
  if (suf === 'E11B') return 'B区';
  if (suf === 'E11C') return 'C区';
  return null;
}

/** 标签短名 */
function shortFloorTitle(title, tabKey) {
  const mapped = basementPartitionTabLabel(tabKey);
  if (mapped) return mapped;
  const k = pickTrim(tabKey);
  if (/^B\d*F-[A-Za-z0-9]+$/i.test(k)) return k.toUpperCase();
  const s = String(title || '').trim();
  if (!s) return '—';
  const mBf = s.match(/\b(B\d+)\s*F\b/i);
  if (mBf) return `${mBf[1].toUpperCase()}F`;
  const mF = s.match(/\b(\d+)\s*F\b/i);
  if (mF) return `${mF[1]}F`;
  const mCn = s.match(/(\d+)\s*(?:层|楼)/);
  if (mCn) return `${mCn[1]}F`;
  const mLoose = s.match(/(\d+)\s*[Ff]/);
  if (mLoose) return `${mLoose[1]}F`;
  return s.length <= 6 ? s : `${s.slice(0, 5)}…`;
}

/** 压差等并入套间标题行，其余仍用紧凑 chip */
function splitTitleSlots(slots) {
  const pressure = [];
  const other = [];
  (slots || []).forEach((m) => {
    const lab = String((m && m.metricKindLabel) || '');
    if (/压差|差压/.test(lab)) pressure.push(m);
    else other.push(m);
  });
  return { suitePressureSlots: pressure, suiteOtherTitleSlots: other };
}

/** 服务端原始串若已含单位则原样展示（不经 WXS，避免摄氏等单位乱码） */
function metricAlreadyHasUnit(v) {
  const s = pickTrim(v);
  if (!s) return true;
  if (s.includes('%')) return true;
  if (s.includes('Pa')) return true;
  if (s.includes('\u2103')) return true;
  if (s.includes('\u00B0')) return true;
  return false;
}

/** 展示用：保留一位小数；若字符串为「数字+单位」则只格式化数字前缀 */
function formatTelemetryDisplayOneDecimal(raw) {
  const v = pickTrim(raw);
  if (!v || v === '—' || v === '-' || v === '\u2014') return '—';
  const cleaned = v.replace(/,/g, '');
  const m = cleaned.match(/^(-?\d+(?:\.\d*)?)([\s\S]*)$/);
  if (m && m[1] !== '') {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n.toFixed(1) + (m[2] || '');
  }
  const n2 = Number(cleaned);
  if (Number.isFinite(n2)) return n2.toFixed(1);
  return v;
}

/** 状态类测量值：WinCC 1/0 → 开/关（与 Web formatTelemetryStatusOnOff 一致） */
function formatTelemetryStatusOnOffMp(raw) {
  const t = pickTrim(raw);
  if (!t || t === '—' || t === '-' || t === '\u2014') return null;
  const u = t.toLowerCase();
  if (u === '1' || u === 'true' || u === 'on') return '\u5f00';
  if (u === '0' || u === 'false' || u === 'off') return '\u5173';
  const n = Number(t.replace(/,/g, '.'));
  if (Number.isFinite(n)) {
    if (n === 1) return '\u5f00';
    if (n === 0) return '\u5173';
  }
  return null;
}

function computeMetricUnitSlot(kindCode, kindLabel) {
  const code = String(kindCode || '').trim().toUpperCase();
  if (code === 'TEMP' || (code.length >= 4 && code.indexOf('TEMP') === 0)) return 'temp';
  if (code === 'HUM' || code === 'RH') return 'hum';
  if (code === 'PRESSURE' || (code.length >= 8 && code.indexOf('PRESSURE') === 0)) return 'pa';
  if (code === 'SWITCH') return 'switch';
  if (code === 'STATUS') return 'status';
  const lab = String(kindLabel || '').trim();
  if (lab === '\u72b6\u6001') return 'status';
  if (lab.includes('温度')) return 'temp';
  if (lab.includes('湿度')) return 'hum';
  if (lab.includes('压差') || lab.includes('差压')) return 'pa';
  return '';
}

/** 指标图标：全部使用基本多语言平面字符，确保所有机型不出现乱码 */
function metricLabIconForSlot(unitSlot) {
  if (unitSlot === 'temp') return '\u2103';   // ℃ 所有机型通用
  if (unitSlot === 'hum') return '\uFF05';    // ％ 所有机型通用
  if (unitSlot === 'pa') return '\u2206';
  if (unitSlot === 'switch') return '';              // 开关靠色块辨识
  if (unitSlot === 'status') return '\u25CF';       // ● 所有机型通用
  return '';
}

/** 与 Web/Java：映射后「开关」；映射前「开关(读写值)(switch)」；(switch) 支持全角括号 */
function textBlobSuggestsSwitchMp(metricKindLabel, displayLabel, variableName) {
  const lb = pickTrim(metricKindLabel);
  const dl = pickTrim(displayLabel);
  if (lb.includes('开关') || dl.includes('开关')) return true;
  const blob = `${lb}\0${dl}`.replace(/（/g, '(').replace(/）/g, ')');
  if (blob.toUpperCase().includes('(SWITCH)')) return true;
  const vn = pickTrim(variableName);
  if (!vn) return false;
  const vu = vn.toUpperCase();
  if (vu.endsWith('_SWITCH') || vu.endsWith('.SWITCH')) return true;
  return (
    vu.includes('_SWITCH_') ||
    vu.includes('.SWITCH.') ||
    vu.includes('_SWITCH.') ||
    vu.includes('.SWITCH_')
  );
}

function isSwitchKind(item, metricKindCode, metricKindLabel) {
  const kr = pickTrim(item && item.kindRole).toUpperCase();
  if (kr === 'SWITCH') return true;
  const mk = pickTrim(metricKindCode).toUpperCase();
  if (mk === 'SWITCH' || mk.includes('SWITCH')) return true;
  const ml =
    metricKindLabel !== undefined && metricKindLabel !== null
      ? metricKindLabel
      : item && item.metricKindLabel;
  return textBlobSuggestsSwitchMp(ml, item && item.displayLabel, item && item.variableName);
}

/** Hub 下发的 prepared：优先扫 suite.rooms（与后端组装器一致，标题槽测点仍挂在房间卡上） */
function preparedRawHasSwitch(prep) {
  if (!prep) return false;
  const rawRooms = prep.suite && prep.suite.rooms;
  if (rawRooms && rawRooms.length) {
    for (let r = 0; r < rawRooms.length; r += 1) {
      const metrics = (rawRooms[r] && rawRooms[r].metrics) || [];
      for (let m = 0; m < metrics.length; m += 1) {
        const met = metrics[m];
        if (met && met.item && isSwitchKind(met.item, met.metricKindCode, met.metricKindLabel)) return true;
      }
    }
    return false;
  }
  const slots = prep.titleSlots || [];
  for (let i = 0; i < slots.length; i += 1) {
    const s = slots[i];
    if (s && s.item && isSwitchKind(s.item, s.metricKindCode, s.metricKindLabel)) return true;
  }
  const rooms = prep.visibleRooms || [];
  for (let r = 0; r < rooms.length; r += 1) {
    const metrics = (rooms[r] && rooms[r].metrics) || [];
    for (let m = 0; m < metrics.length; m += 1) {
      const met = metrics[m];
      if (met && met.item && isSwitchKind(met.item, met.metricKindCode, met.metricKindLabel)) return true;
    }
  }
  return false;
}

function isSetpointKind(item, metricKindCode) {
  const kr = pickTrim(item && item.kindRole).toUpperCase();
  if (kr === 'SETPOINT') return true;
  return pickTrim(metricKindCode).toUpperCase() === 'SETPOINT';
}

/** 与 Web stripLeadingSuitePrefixFromRoomDisplay */
function stripLeadingSuitePrefixFromRoomDisplayMp(rc) {
  const s = pickTrim(rc);
  if (!s) return '';
  const stripped = s.replace(/^套间\s*[·•]\s*/, '').trim();
  return stripped || s;
}

/** 房间路径分隔符统一为 ASCII `-`，含全角横线、En dash 等 */
function normalizeRoomCanonicalSeparatorsMp(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/\u2013/g, '-').replace(/\u2014/g, '-').replace(/\uff0d/g, '-');
  return s.trim();
}

/** 全角数字 ０-９ → 0-9，便于解析末段编号 */
function normalizeAsciiDigitsInStringMp(s) {
  return String(s || '').replace(/[\uff10-\uff19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
  );
}

/** 动力站 / 锅炉房在路径分段中的固定词（与点名 roomCanonical 一致） */
const MP_FACILITY_MARK_POWER = '\u52a8\u529b\u7ad9';
const MP_FACILITY_MARK_BOILER = '\u950a\u7089\u623f';

/**
 * 从 roomCanonical 取出「动力站/锅炉房」之后、实例编号与「状态」等尾缀之前的设备名称段。
 * 例：B1F-E10-动力站-冷冻水泵-01-状态 → 冷冻水泵；E10-锅炉房-蒸汽报警-01 → 蒸汽报警
 */
function mpFacilityRoomEquipmentLabelMp(roomCanonical) {
  const rc = normalizeRoomCanonicalSeparatorsMp(pickTrim(roomCanonical));
  if (!rc) return '';
  const stripped = stripLeadingSuitePrefixFromRoomDisplayMp(rc);
  if (!stripped) return '';
  const norm = normalizeAsciiDigitsInStringMp(stripped);
  const parts = norm.split(/[-_]/).map((x) => String(x || '').trim()).filter(Boolean);
  if (!parts.length) return '';
  let fi = -1;
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === MP_FACILITY_MARK_POWER || parts[i] === MP_FACILITY_MARK_BOILER) {
      fi = i;
      break;
    }
  }
  if (fi < 0) return '';
  let sub = parts.slice(fi + 1);
  while (sub.length) {
    const last = sub[sub.length - 1];
    const lu = last.toUpperCase();
    if (/^\d+$/.test(last)) {
      sub.pop();
      continue;
    }
    if (last === '\u72b6\u6001' || lu === 'STATUS') {
      sub.pop();
      continue;
    }
    break;
  }
  if (!sub.length) return '';
  return sub.join('-');
}

/**
 * 设施路径下：从单条测点的 roomCanonical（或 displayLabel）取「动力站/锅炉房」之后的最近一段纯数字实例号 → 「N号」，
 * 用于小房间内参数行左侧名称；与 {@link mpFacilityRoomEquipmentLabelMp} 房间标题设备名独立。
 */
function mpFacilityMetricOrdinalLabelMp(item) {
  const rcRaw = pickTrim(item && item.roomCanonical);
  const rc = normalizeRoomCanonicalSeparatorsMp(rcRaw);
  const strippedRc = rc ? stripLeadingSuitePrefixFromRoomDisplayMp(rc) : '';
  let norm = normalizeAsciiDigitsInStringMp(strippedRc);
  const hasFac = (blob) =>
    blob.indexOf(MP_FACILITY_MARK_POWER) >= 0 || blob.indexOf(MP_FACILITY_MARK_BOILER) >= 0;
  let parts = norm
    ? norm.split(/[-_]/).map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (!parts.length || !hasFac(norm)) {
    const dl = normalizeAsciiDigitsInStringMp(
      stripTrailingStatusFromDisplayLabelMp(item && item.displayLabel)
    );
    if (!dl || !hasFac(dl)) return '';
    parts = dl.split(/[-_·•]/).map((x) => String(x || '').trim()).filter(Boolean);
    norm = dl;
  }
  if (!parts.length || !hasFac(norm)) return '';
  let fi = -1;
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === MP_FACILITY_MARK_POWER || parts[i] === MP_FACILITY_MARK_BOILER) {
      fi = i;
      break;
    }
  }
  if (fi < 0) return '';
  const after = parts.slice(fi + 1);
  for (let i = after.length - 1; i >= 0; i -= 1) {
    const seg = after[i];
    if (/^\d+$/.test(seg)) {
      const n = parseInt(seg, 10);
      if (Number.isFinite(n)) return `${n}\u53f7`;
      return '';
    }
  }
  return '';
}

/**
 * 小程序专属：动力站 / 锅炉房路径下小房间展示设备简称（冷冻水泵、蒸汽报警等），不再映射为「N号」。
 * 非设施路径仍去掉套间前缀后整段展示；解析失败见 {@link resolveMpFacilityCardDisplayTitleMp} 从 metrics 回退。
 */
function mpFacilitySuiteOrdinalOrStripRoomDisplay(roomCanonical) {
  const rc = normalizeRoomCanonicalSeparatorsMp(pickTrim(roomCanonical));
  if (!rc) return '';
  const stripped = stripLeadingSuitePrefixFromRoomDisplayMp(rc);
  if (!stripped) return '';
  const normStrip = normalizeAsciiDigitsInStringMp(stripped);
  const isFacility =
    normStrip.indexOf(MP_FACILITY_MARK_POWER) >= 0 || normStrip.indexOf(MP_FACILITY_MARK_BOILER) >= 0;
  if (!isFacility) return stripped;
  const equip = mpFacilityRoomEquipmentLabelMp(rc);
  if (equip) return equip;
  return stripped;
}

/** 卡片 roomCanonical 缺段时，从测点原始 roomCanonical 推设备简称 */
function mpFacilityEquipmentLabelFromCardMetricsMp(card) {
  const metrics = (card && card.metrics) || [];
  for (let i = 0; i < metrics.length; i += 1) {
    const ir = normalizeRoomCanonicalSeparatorsMp(pickTrim(metrics[i] && metrics[i].item && metrics[i].item.roomCanonical));
    if (!ir) continue;
    const lab = mpFacilityRoomEquipmentLabelMp(ir);
    if (lab) return lab;
  }
  return '';
}

function resolveMpFacilityCardDisplayTitleMp(card) {
  const rcCard = normalizeRoomCanonicalSeparatorsMp(pickTrim(card && card.roomCanonical));
  const fallbackTitle = pickTrim(card && card.displayTitle) || rcCard;
  const fromRc = mpFacilitySuiteOrdinalOrStripRoomDisplay(rcCard);
  if (fromRc) return fromRc;
  const fromMet = mpFacilityEquipmentLabelFromCardMetricsMp(card);
  if (fromMet) return fromMet;
  return fallbackTitle;
}

/** 与 Web isStatusTelemetryMetric：以 item 字典 label 判型，避免 slot 已换成房间名后误判 */
function isStatusMetricMp(metricKindCode, itemMetricKindLabel) {
  const code = String(metricKindCode || '').trim().toUpperCase();
  if (code === 'STATUS') return true;
  return String(itemMetricKindLabel || '').trim() === '\u72b6\u6001';
}

function stripTrailingStatusFromDisplayLabelMp(dl) {
  let s = pickTrim(dl);
  if (!s) return '';
  const suffixes = [
    '\u00b7\u72b6\u6001',
    '\u2022\u72b6\u6001',
    '-\u72b6\u6001',
    '_\u72b6\u6001',
    '/\u72b6\u6001',
    '\\\u72b6\u6001',
    '\u72b6\u6001',
  ];
  for (let i = 0; i < suffixes.length; i++) {
    const suf = suffixes[i];
    if (s.length >= suf.length && s.slice(-suf.length) === suf) {
      s = s.slice(0, -suf.length).trim();
      break;
    }
  }
  const u = s.toUpperCase();
  if (u.endsWith(' STATUS')) s = s.slice(0, -' STATUS'.length).trim();
  return s;
}

/** 与 Web statusMetricSlotDisplayLabel / Java statusMetricSlotDisplayLabel；设施路径优先「N号」与房间内参数行一致 */
function statusMetricSlotDisplayLabelFromItemMp(item) {
  const ord = mpFacilityMetricOrdinalLabelMp(item);
  if (ord) return ord;
  const rc = normalizeRoomCanonicalSeparatorsMp(pickTrim(item && item.roomCanonical));
  const stripped = stripLeadingSuitePrefixFromRoomDisplayMp(rc);
  if (!stripped) {
    const fromDl = stripTrailingStatusFromDisplayLabelMp(item && item.displayLabel);
    return fromDl || '';
  }
  const norm = normalizeAsciiDigitsInStringMp(stripped);
  const isFacility =
    norm.indexOf(MP_FACILITY_MARK_POWER) >= 0 || norm.indexOf(MP_FACILITY_MARK_BOILER) >= 0;
  if (isFacility) {
    const equip = mpFacilityRoomEquipmentLabelMp(rc);
    if (equip) return equip;
    return stripped;
  }
  return stripped;
}

function winccSwitchConfirmContentMp(nextVal, item) {
  const floor = pickTrim(item && item.floorCode) || '—';
  const rc = pickTrim(item && item.roomCanonical);
  const room = mpFacilitySuiteOrdinalOrStripRoomDisplay(rc) || rc || '—';
  return nextVal === 1 ? `确认启动-${floor}-${room}?` : `确认关闭-${floor}-${room}?`;
}

/** 与清单一致：去掉「（读写值）」「·读写值」等（metric_kind.label_zh 常为「开关（读写值）」） */
function stripSwitchMetricLabelMp(lab) {
  let s = String(lab || '').trim();
  s = s.replace(/[（(]\s*读写值\s*[）)]/g, '');
  s = s.replace(/[·•]\s*读写值\s*$/, '').replace(/\s*读写值\s*$/, '').trim();
  return s;
}

/** 与 Web AnimalRoomTelemetryPage.parseWinccSwitchTriState 一致 */
function parseWinccSwitchTriState(raw) {
  if (raw == null) return null;
  const t = pickTrim(raw);
  if (t === '' || t === '—' || t === '\u2014' || t === '-') return null;
  if (t === '\u5f00') return true;
  if (t === '\u5173') return false;
  const u = t.toLowerCase();
  if (u === '1' || u === 'true' || u === 'on' || u === 'yes') return true;
  if (u === '0' || u === 'false' || u === 'off' || u === 'no') return false;
  const n = Number(t.replace(/,/g, '.'));
  if (n === 1) return true;
  if (n === 0) return false;
  return null;
}

/** 套间右上角：短于 yyyy/M/d HH:mm:ss（如 5/4 14:30） */
function compactSuiteLatestText(raw) {
  const s = pickTrim(raw);
  if (!s || s === '\u2014' || s === '\u2015' || s === '-') return '\u2014';
  const m = s.match(/^(\d+)\/(\d+)\/(\d+)\s+(\d{1,2}:\d{2})/);
  if (m) {
    return `${Number(m[2])}/${Number(m[3])} ${m[4]}`;
  }
  return s.length > 16 ? `${s.slice(0, 16)}\u2026` : s;
}

function alarmBandClass(item) {
  if (!item) return '';
  const b = String(item.alarmBand || '').trim().toUpperCase();
  if (b === 'HIGH') return 'art-metric-high';
  if (b === 'LOW') return 'art-metric-low';
  if (b === 'OK') return 'art-metric-ok';
  if (item.alarmOutOfRange === true) return 'art-metric-oor';
  const parts = parseMetricUnitParts(item.metricKindCode, item.metricKindLabel, item.value);
  const v = parseNumFromDisplayCore(parts.displayCore);
  if (!Number.isFinite(v)) return '';
  const minN = parseAlarmLimitNum(item.alarmMinValue);
  const maxN = parseAlarmLimitNum(item.alarmMaxValue);
  if (Number.isFinite(maxN) && v > maxN) return 'art-metric-high';
  if (Number.isFinite(minN) && v < minN) return 'art-metric-low';
  return '';
}

/** Unicode 指向箭头（禁用三角）；平缓/无趋势不显示字符 */
function valueTrendGlyph(t) {
  const u = String(t || '').trim().toUpperCase();
  if (u === 'UP') return '\u2191';
  if (u === 'DOWN') return '\u2193';
  return '';
}

/** 与 Web telemetry 趋势色一致：升绿 / 降蓝 */
function valueTrendToneClass(t) {
  const u = String(t || '').trim().toUpperCase();
  if (u === 'UP') return 'art-trend-up';
  if (u === 'DOWN') return 'art-trend-down';
  return '';
}

/** 拆成 displayCore + unitSlot */
function parseMetricUnitParts(kindCode, kindLabel, value) {
  const code = String(kindCode || '').trim().toUpperCase();
  const lab = String(kindLabel || '').trim();
  const isStatus = code === 'STATUS' || lab === '\u72b6\u6001';
  if (isStatus) {
    const v = pickTrim(value);
    if (!v || v === '—' || v === '-' || v === '\u2014') return { displayCore: '—', unitSlot: '' };
    const mapped = formatTelemetryStatusOnOffMp(v);
    if (mapped) return { displayCore: mapped, unitSlot: '' };
  }

  const v = pickTrim(value);
  if (!v || v === '—' || v === '-' || v === '\u2014') return { displayCore: '—', unitSlot: '' };
  if (metricAlreadyHasUnit(v)) return { displayCore: formatTelemetryDisplayOneDecimal(v), unitSlot: '' };

  const slot = computeMetricUnitSlot(kindCode, kindLabel);
  if (!slot) return { displayCore: v, unitSlot: '' };
  return { displayCore: formatTelemetryDisplayOneDecimal(v), unitSlot: slot };
}

/** 数值+单位同一 text，避免小盒+过小字号像「贴图」；℃ 用 U+2103 与 Web 一致 */
function composeDisplayWithUnit(displayCore, unitSlot) {
  const c = pickTrim(displayCore);
  if (!c || c === '—' || c === '-' || c === '\u2014') return '\u2014';
  if (!unitSlot) return c;
  if (unitSlot === 'temp') return c + '\u2103';
  if (unitSlot === 'hum') return c + '%';
  if (unitSlot === 'pa') return c + 'Pa';
  return c;
}

function parseNumFromDisplayCore(displayCore) {
  const s = pickTrim(displayCore);
  if (!s || s === '—' || s === '\u2014') return NaN;
  const m = s.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) return NaN;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : NaN;
}

function parseAlarmLimitNum(raw) {
  const s = pickTrim(raw);
  if (!s) return NaN;
  const n = Number(s.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : NaN;
}

/** 与 Web interventionValueTrend.ts 一致：越限/逼近限值且趋势朝向风险时才提示（自控拉回少打扰） */
const INTERVENTION_ZONE_FRAC = 0.08;

function shouldShowInterventionValueTrend(item, kindCode, kindLabel) {
  if (!item) return false;
  const t = String(item.valueTrend || '').trim().toUpperCase();
  if (t !== 'UP' && t !== 'DOWN') return false;
  const band = String(item.alarmBand || '').trim().toUpperCase();
  if (band === 'HIGH' || band === 'LOW') return true;
  if (item.alarmOutOfRange === true) return true;
  const parts = parseMetricUnitParts(kindCode, kindLabel, item.value);
  const v = parseNumFromDisplayCore(parts.displayCore);
  if (!Number.isFinite(v)) return false;
  const minN = parseAlarmLimitNum(item.alarmMinValue);
  const maxN = parseAlarmLimitNum(item.alarmMaxValue);
  if (Number.isFinite(minN) && Number.isFinite(maxN) && maxN > minN) {
    const span = maxN - minN;
    const hi = maxN - INTERVENTION_ZONE_FRAC * span;
    const lo = minN + INTERVENTION_ZONE_FRAC * span;
    if (t === 'UP' && v >= hi) return true;
    if (t === 'DOWN' && v <= lo) return true;
    return false;
  }
  if (Number.isFinite(maxN) && t === 'UP') {
    const margin = Math.max(Math.abs(maxN) * 0.025, 0.55);
    return v >= maxN - margin;
  }
  if (Number.isFinite(minN) && t === 'DOWN') {
    const margin = Math.max(Math.abs(minN) * 0.025, 0.55);
    return v <= minN + margin;
  }
  return false;
}

/** 图标全部使用 BMP 基本字符（℃％∆●），无需按数值缩放；统一使用基准尺寸 */
function iconSizeClassForMetric(_unitSlot, _displayCore) {
  return '';
}

function enrichMetricSlot(slot) {
  if (!slot || !slot.item) return slot;
  let slotWork = slot;
  if (isStatusMetricMp(slotWork.metricKindCode, slotWork.item.metricKindLabel)) {
    const roomLab = statusMetricSlotDisplayLabelFromItemMp(slotWork.item);
    if (roomLab) slotWork = { ...slotWork, metricKindLabel: roomLab };
  }
  if (isSwitchKind(slotWork.item, slotWork.metricKindCode, slotWork.metricKindLabel)) {
    const tri = parseWinccSwitchTriState(slotWork.item.value);
    const lab = stripSwitchMetricLabelMp(slotWork.metricKindLabel || slotWork.metricKindCode || '');
    return {
      ...slotWork,
      displayCore: '',
      unitSlot: 'switch',
      displayWithUnit: '',
      icoSizeClass: '',
      labIcon: metricLabIconForSlot('switch'),
      bandClass: '',
      trendChar: '',
      trendToneClass: '',
      isSwitch: true,
      switchOn: tri === true,
      switchOff: tri === false,
      switchUnknown: tri === null,
      switchDisplayLabel: lab,
    };
  }
  const parts = parseMetricUnitParts(slotWork.metricKindCode, slotWork.metricKindLabel, slotWork.item.value);
  const us = parts.unitSlot || computeMetricUnitSlot(slotWork.metricKindCode, slotWork.metricKindLabel);
  const labIcon = metricLabIconForSlot(us);
  const displayWithUnit = composeDisplayWithUnit(parts.displayCore, parts.unitSlot);
  const icoSizeClass = iconSizeClassForMetric(parts.unitSlot, parts.displayCore);
  const showTrend = shouldShowInterventionValueTrend(slotWork.item, slotWork.metricKindCode, slotWork.metricKindLabel);
  const isSp = isSetpointKind(slotWork.item, slotWork.metricKindCode);
  return {
    ...slotWork,
    ...parts,
    displayWithUnit,
    icoSizeClass,
    labIcon,
    bandClass: alarmBandClass(slotWork.item),
    trendChar: showTrend ? valueTrendGlyph(slotWork.item.valueTrend) : '',
    trendToneClass: showTrend ? valueTrendToneClass(slotWork.item.valueTrend) : '',
    isSetpoint: isSp,
  };
}

function enrichMetricMet(met) {
  if (!met || !met.item) return met;
  let metWork = met;
  /** 动力站/锅炉房：小房间内参数行左侧为实例「N号」，与卡片标题（设备简称）分流 */
  const facOrd = mpFacilityMetricOrdinalLabelMp(metWork.item);
  if (facOrd) {
    metWork = { ...metWork, metricKindLabel: facOrd };
  } else if (isStatusMetricMp(metWork.metricKindCode, metWork.item.metricKindLabel)) {
    const roomLab = statusMetricSlotDisplayLabelFromItemMp(metWork.item);
    if (roomLab) metWork = { ...metWork, metricKindLabel: roomLab };
  }
  if (isSwitchKind(metWork.item, metWork.metricKindCode, metWork.metricKindLabel)) {
    const tri = parseWinccSwitchTriState(metWork.item.value);
    const lab = stripSwitchMetricLabelMp(metWork.metricKindLabel || metWork.metricKindCode || '');
    return {
      ...metWork,
      displayCore: '',
      unitSlot: 'switch',
      displayWithUnit: '',
      icoSizeClass: '',
      labIcon: metricLabIconForSlot('switch'),
      bandClass: '',
      trendChar: '',
      trendToneClass: '',
      isSwitch: true,
      switchOn: tri === true,
      switchOff: tri === false,
      switchUnknown: tri === null,
      switchDisplayLabel: lab,
    };
  }
  const parts = parseMetricUnitParts(metWork.metricKindCode, metWork.metricKindLabel, metWork.item.value);
  const us = parts.unitSlot || computeMetricUnitSlot(metWork.metricKindCode, metWork.metricKindLabel);
  const labIcon = metricLabIconForSlot(us);
  const displayWithUnit = composeDisplayWithUnit(parts.displayCore, parts.unitSlot);
  const icoSizeClass = iconSizeClassForMetric(parts.unitSlot, parts.displayCore);
  const showTrend = shouldShowInterventionValueTrend(metWork.item, metWork.metricKindCode, metWork.metricKindLabel);
  const isSp = isSetpointKind(metWork.item, metWork.metricKindCode);
  return {
    ...metWork,
    ...parts,
    displayWithUnit,
    icoSizeClass,
    labIcon,
    bandClass: alarmBandClass(metWork.item),
    trendChar: showTrend ? valueTrendGlyph(metWork.item.valueTrend) : '',
    trendToneClass: showTrend ? valueTrendToneClass(metWork.item.valueTrend) : '',
    isSetpoint: isSp,
  };
}

/**
 * 同一小房间内数值统一缩放档位：仅在数值极长(≥14字符)或 3+列套间且数值≥10字符时降一档(24rpx)。
 * 不再使用 micro(15rpx)/tiny(17rpx) 档位。
 * @param {object} card 已 enrichMetricMet 的 card
 * @param {number} visibleRoomCountInSuite 当前套间 visibleRooms 数量（≥3 视为窄列）
 * @param {number} [soloRowCardCount] 单间分区一行卡数，≥2 时按窄列参与估算
 */
function computeCardMetricFontTier(card, visibleRoomCountInSuite, soloRowCardCount) {
  const metrics = (card && card.metrics) || [];
  if (!metrics.length) return '';
  let maxDisp = 0;
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    const du = String(m.displayWithUnit || '')
      .replace(/—|—/g, '')
      .trim();
    maxDisp = Math.max(maxDisp, du.length);
  }
  const narrowSuite = visibleRoomCountInSuite >= 3;
  const narrowSolo = (soloRowCardCount || 0) >= 2;
  const narrow = narrowSuite || narrowSolo;
  const veryLong = maxDisp >= 14;
  if (veryLong || (narrow && maxDisp >= 10)) return 'art-room-metrics--fs-tight';
  return '';
}
function reflowSoloRowsTwoPerLine(rows) {
  const cards = [];
  (rows || []).forEach((row) => {
    const cs = (row && row.cards) || [];
    cs.forEach((c) => cards.push(c));
  });
  if (!cards.length) return [];
  const newRows = [];
  for (let i = 0; i < cards.length; i += 2) {
    newRows.push({ cards: cards.slice(i, i + 2) });
  }
  return newRows;
}

function enrichSoloCardMetrics(card, soloRowCardCount) {
  if (!card) return card;
  const next = {
    ...card,
    displayTitle: resolveMpFacilityCardDisplayTitleMp(card),
    metrics: (card.metrics || []).map(enrichMetricMet),
  };
  return {
    ...next,
    metricFontTier: computeCardMetricFontTier(next, 1, soloRowCardCount),
  };
}

/** 服务端已按楼层→B 层 E 区→套间/单间→参数项数排版；此处仅做两列 reflow */
function reflowSolosPartitions(partitions) {
  if (!Array.isArray(partitions) || partitions.length === 0) return [];
  return partitions.map((part, i) => ({
    ...part,
    _partitionKey: `p${i}-${part && part.label != null ? part.label : 'x'}`,
    rows: reflowSoloRowsTwoPerLine((part && part.rows) || []).map((row) => ({
      ...row,
      cards: (row.cards || []).map((c) => enrichSoloCardMetrics(c, (row.cards || []).length)),
    })),
    zoneSub: (part && part.zoneSub) || '',
  }));
}

Component({
  properties: {
    /** GET /animal-room 返回的页数据 */
    telemetryPage: {
      type: Object,
      value: null,
    },
    showRoomOverviewEntry: {
      type: Boolean,
      value: true,
    },
    /** Hub 全页（如 animalRoomRun）时略收紧顶侧条左右留白 */
    embeddedHost: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    loading: true,
    err: '',
    structTabs: [],
    activeTabIndex: 0,
    viewChunks: [],
    soloWidthPx: 360,
    /** 轮询替换列表后恢复纵向位置，减轻「先弹回顶部再回去」的闪烁感 */
    mainScrollTop: 0,
    fetchedAtText: '—',
    panelMetaLine: '',
    metricDetailVisible: false,
    setpointSheetVisible: false,
    setpointSheetVn: '',
    setpointSheetDraft: '',
    setpointSheetParamHint: '',
    setpointSheetParamHintTier: '',
    setpointSheetLastFetchLine: '',
    setpointSheetRefreshing: false,
    metricDetail: {
      metricKindLabel: '',
      metricKindCode: '',
      valueRaw: '',
      displayCore: '—',
      unitSlot: '',
      displayWithUnit: '\u2014',
      bandClass: '',
      labIcon: '',
      tsText: '—',
      displayLabel: '',
      showDisplayLabel: false,
      showAlarm: false,
      alarmMin: '',
      alarmMax: '',
      showAminVn: false,
      alarmMinVn: '',
      showAmaxVn: false,
      alarmMaxVn: '',
      variableName: '—',
      qualityCode: '',
      showQuality: false,
      error: '',
      showError: false,
      archiveSummary: '',
      archiveChartReady: false,
      archiveChartImage: '',
      archiveChartGenFailed: false,
      bundleCode: '',
      watchlistTagId: null,
      canSaveOverride: false,
      overrideMinDraft: '',
      overrideMaxDraft: '',
      overrideEditWhich: '',
      isSetpoint: false,
      canWriteSetpoint: false,
      setpointEditActive: false,
      setpointDraft: '',
      setpointRowLabel: '',
      setpointMapHintLine: '',
      setpointMapHintTier: '',
    },
    /** WinCC 开关确认弹层（替代 wx.showModal，便于右上角「刷新该点」） */
    switchConfirmVisible: false,
    switchConfirmMain: '',
    switchConfirmLastFetchLine: '',
    switchConfirmVn: '',
    switchConfirmNextVal: 0,
    switchConfirmKindRole: 'SWITCH',
    switchConfirmRefreshing: false,
  },

  observers: {
    telemetryPage(page) {
      if (page && Array.isArray(page.tabs)) {
        this.applyTelemetryPage(page);
      } else if (!page && !this.data.metricDetailVisible) {
        this.setData({ loading: true, err: '' });
      }
    },
  },

  lifetimes: {
    attached() {
      this._telemetryPage = null;
      this._telemetryMainScrollTop = 0;
      this._lastAppliedFloorTabKey = '';
      /** 用户点侧边楼层或上次成功渲染的楼层索引；轮询时优先于尚未提交的 data.activeTabIndex，避免先渲染第一层再跳回 */
      this._lastStableTabIndex = undefined;
      const p = this.properties.telemetryPage;
      if (p && Array.isArray(p.tabs)) {
        this.applyTelemetryPage(p);
      }
    },
  },

  pageLifetimes: {
    show() {
      this.measureSoloWidth();
    },
  },

  methods: {
    onRoomOverviewTap() {
      this.triggerEvent('openroomoverview', {}, { bubbles: false });
    },
    /** 顶栏仅显示更新时间（与 Web 对齐，节省空间） */
    buildPanelMeta(tab, fetchedAtText) {
      const ft = fetchedAtText || '—';
      return `更新 ${ft}`;
    },

    /** 套间块数据；标题区始终带参数名，房间内三列套间隐藏参数名由 wxml 控制 */
    enrichPrepared(prep) {
      if (!prep) return prep;
      const { suitePressureSlots, suiteOtherTitleSlots } = splitTitleSlots(prep.titleSlots);
      const sp = suitePressureSlots.map(enrichMetricSlot);
      const so = suiteOtherTitleSlots.map(enrichMetricSlot);
      const rooms = prep.visibleRooms || [];
      const nRooms = rooms.length;
      const rawSuiteTitle = prep.suite && prep.suite.suiteTitle != null ? String(prep.suite.suiteTitle) : '';
      return {
        ...prep,
        suiteTitleDisplay: stripSuiteTitlePrefixForDisplayMp(rawSuiteTitle),
        suitePressureSlots: sp,
        suiteOtherTitleSlots: so,
        titleSlotCount: sp.length + so.length,
        visibleRooms: rooms.map((card) => {
          const next = {
            ...card,
            displayTitle: resolveMpFacilityCardDisplayTitleMp(card),
            metrics: (card.metrics || []).map(enrichMetricMet),
          };
          return {
            ...next,
            metricFontTier: computeCardMetricFontTier(next, nRooms, 0),
          };
        }),
      };
    },

    normalizeViewChunks(rows) {
      if (!Array.isArray(rows)) return [];
      const out = [];
      rows.forEach((ch) => {
        if (ch.kind === 'suite' && ch.prepared) {
          out.push({
            ...ch,
            /** 真机勿用服务端 suiteHalfRow 半宽：否则套间只占半屏、单间像「一行只占一半」 */
            suiteHalfRow: false,
            suiteLatestCompact: compactSuiteLatestText(ch.suiteLatestText),
            prepared: this.enrichPrepared(ch.prepared),
            suiteSwitchFullRow: preparedRawHasSwitch(ch.prepared),
          });
          return;
        }
        if (ch.kind === 'chromeSuiteRow' && Array.isArray(ch.list)) {
          const rawList = ch.list;
          const pieces = [];
          let batch = [];
          const flushBatch = () => {
            if (!batch.length) return;
            pieces.push(batch);
            batch = [];
          };
          rawList.forEach((rawCell) => {
            if (preparedRawHasSwitch(rawCell && rawCell.prepared)) {
              flushBatch();
              pieces.push([rawCell]);
            } else {
              batch.push(rawCell);
            }
          });
          flushBatch();
          const multi = pieces.length > 1;
          pieces.forEach((piece, pi) => {
            out.push({
              ...ch,
              key: multi ? `${ch.key}-p${pi}` : ch.key,
              list: piece.map((cell) => ({
                ...cell,
                suiteLatestCompact: compactSuiteLatestText(cell.suiteLatestText),
                prepared: cell.prepared ? this.enrichPrepared(cell.prepared) : cell.prepared,
              })),
            });
          });
          return;
        }
        if (ch.kind === 'solos' && Array.isArray(ch.partitions)) {
          out.push({
            ...ch,
            partitions: reflowSolosPartitions(ch.partitions),
          });
          return;
        }
        out.push(ch);
      });
      return out;
    },

    applyTelemetryPage(page, opts) {
      this._telemetryPage = page;
      const baseTabs = (page && page.tabs) || [];
      const syntheticHvacTab = animalRoomHvacUnits.resolveSyntheticHvacTab(baseTabs, page);
      const tabs = animalRoomHvacUnits.mergeDisplayTabsWithHvac(baseTabs, page);
      let idx;
      // 轮询 setData 新 telemetryPage 时无 opts：须与侧栏当前楼层一致，禁止仅靠 fallback 索引回到 1F（post-save-no-full-refresh.mdc）
      const preserveTk = (opts && pickTrim(opts.preserveTabKey)) || getPreserveFloorTabKey(this);
      if (preserveTk && tabs.length) {
        const fl = preserveTk.toLowerCase();
        const hit = tabs.findIndex((t) => pickTrim(t && t.tabKey).toLowerCase() === fl);
        if (hit >= 0) idx = hit;
      }
      if (idx === undefined) {
        const preferred =
          pickTrim(this._lastAppliedFloorTabKey) ||
          pickTrim(this._preferredFloorTabKey) ||
          readStoredAnimalRoomTelemetryTabKey();
        const fallbackIdx = Number.isFinite(this._lastStableTabIndex)
          ? this._lastStableTabIndex
          : this.data.activeTabIndex;
        idx = resolveAnimalRoomTelemetryFloorIndex(tabs, fallbackIdx, preferred);
      }
      const row = tabs[idx];
      const chosenTabKey = row && row.tabKey != null ? pickTrim(row.tabKey) : '';
      if (chosenTabKey) {
        this._preferredFloorTabKey = chosenTabKey;
        writeStoredAnimalRoomTelemetryTabKey(chosenTabKey);
        this.triggerEvent('telemetrytabchange', { tabKey: chosenTabKey }, { bubbles: false });
      }
      const sidebar = tabs.map((t) => ({
        tabKey: t.tabKey,
        title: t.title,
        tabLabel:
          animalRoomHvacUnits.isSyntheticHvacTabKey(t.tabKey) ? '机房' : shortFloorTitle(t.title, t.tabKey),
        roomCount: t.roomCount,
        suiteCount: t.suiteCount,
      }));
      const fetchedAtText = formatFetchedAt(page && page.fetchedAt);
      let rawChunks =
        chosenTabKey &&
        animalRoomHvacUnits.isSyntheticHvacTabKey(chosenTabKey) &&
        syntheticHvacTab &&
        Array.isArray(syntheticHvacTab.viewChunks)
          ? syntheticHvacTab.viewChunks
          : (row && row.viewChunks) || [];
      if (
        chosenTabKey &&
        !animalRoomHvacUnits.isSyntheticHvacTabKey(chosenTabKey) &&
        Array.isArray(rawChunks) &&
        rawChunks.length
      ) {
        rawChunks = animalRoomHvacUnits.filterHubChunksExcludeHvacUnits(rawChunks);
      }
      if (this.data.metricDetailVisible) {
        this._lastStableTabIndex = idx;
        if (chosenTabKey) this._lastAppliedFloorTabKey = chosenTabKey;
        const patch = {};
        if (fetchedAtText !== this.data.fetchedAtText) {
          patch.fetchedAtText = fetchedAtText;
          const bar = this.data.structTabs[idx];
          if (bar) patch.panelMetaLine = this.buildPanelMeta(bar, fetchedAtText);
        }
        if (Object.keys(patch).length) this.setData(patch);
        return;
      }
      const prevFloorKey = pickTrim(this._lastAppliedFloorTabKey);
      const sameFloor =
        !!prevFloorKey &&
        !!chosenTabKey &&
        prevFloorKey.toLowerCase() === chosenTabKey.toLowerCase();
      let scrollRestore = 0;
      if (sameFloor && Number.isFinite(this._telemetryMainScrollTop)) {
        scrollRestore = Math.max(0, this._telemetryMainScrollTop);
      }
      if (!sameFloor) {
        this._telemetryMainScrollTop = 0;
        scrollRestore = 0;
      }
      this._lastAppliedFloorTabKey = chosenTabKey || prevFloorKey;
      this._lastStableTabIndex = idx;
      const normalizedChunks = this.normalizeViewChunks(rawChunks);
      const payload = {
        loading: false,
        err: '',
        structTabs: sidebar,
        activeTabIndex: idx,
        viewChunks: normalizedChunks,
        fetchedAtText,
        panelMetaLine: this.buildPanelMeta(sidebar[idx], fetchedAtText),
        mainScrollTop: scrollRestore,
      };
      this.setData(payload);
    },

    onTelemetryMainScroll(e) {
      const d = e.detail;
      const t = d && d.scrollTop;
      if (typeof t === 'number' && Number.isFinite(t)) {
        this._telemetryMainScrollTop = t;
      }
    },

    measureSoloWidth() {
      const self = this;
      wx.createSelectorQuery()
        .in(this)
        .select('.art-stack-main')
        .boundingClientRect((rect) => {
          if (!rect || !rect.width) return;
          const w = Math.floor(rect.width);
          if (w === self.data.soloWidthPx) return;
          self.setData({ soloWidthPx: w });
          self.triggerEvent('telemetryreload', { soloWidthPx: w }, { bubbles: false });
        })
        .exec();
    },

    onSidebarTap(e) {
      const idx = Number(e.currentTarget.dataset.index);
      if (!Number.isFinite(idx) || idx < 0) return;
      this._lastStableTabIndex = idx;
      const page = this._telemetryPage;
      const baseTabs = (page && page.tabs) || [];
      const syntheticHvacTab = animalRoomHvacUnits.resolveSyntheticHvacTab(baseTabs, page);
      const tabs = animalRoomHvacUnits.mergeDisplayTabsWithHvac(baseTabs, page);
      const row = tabs[idx];
      const tk = row && row.tabKey != null ? pickTrim(row.tabKey) : '';
      if (tk) {
        this._preferredFloorTabKey = tk;
        writeStoredAnimalRoomTelemetryTabKey(tk);
        this._lastAppliedFloorTabKey = tk;
        this.triggerEvent('telemetrytabchange', { tabKey: tk }, { bubbles: false });
      }
      this._telemetryMainScrollTop = 0;
      const bar = this.data.structTabs[idx];
      let rawChunks =
        tk &&
        animalRoomHvacUnits.isSyntheticHvacTabKey(tk) &&
        syntheticHvacTab &&
        Array.isArray(syntheticHvacTab.viewChunks)
          ? syntheticHvacTab.viewChunks
          : (row && row.viewChunks) || [];
      if (tk && !animalRoomHvacUnits.isSyntheticHvacTabKey(tk) && Array.isArray(rawChunks) && rawChunks.length) {
        rawChunks = animalRoomHvacUnits.filterHubChunksExcludeHvacUnits(rawChunks);
      }
      // 机房 Tab：若服务端 hvacMechanicalHubViewChunks 尚未缓存，即使本地合成有部分内容也强制拉一次完整数据
      const isHvacTab = tk && animalRoomHvacUnits.isSyntheticHvacTabKey(tk);
      const hvacHubUncached =
        isHvacTab &&
        !(
          page &&
          Array.isArray(page.hvacMechanicalHubViewChunks) &&
          page.hvacMechanicalHubViewChunks.length
        );
      if ((!rawChunks.length || hvacHubUncached) && tk) {
        this.triggerEvent(
          'telemetryfetchtab',
          { tabKey: tk, soloWidthPx: this.data.soloWidthPx },
          { bubbles: false }
        );
        // 机房 Tab 有部分内容时先展示，避免空白闪烁（等拉取完成后 observer 会用完整数据刷新）
        const previewChunks = hvacHubUncached ? this.normalizeViewChunks(rawChunks) : [];
        this.setData({
          activeTabIndex: idx,
          viewChunks: previewChunks,
          panelMetaLine: this.buildPanelMeta(bar, this.data.fetchedAtText),
          mainScrollTop: 0,
        });
        return;
      }
      this.setData({
        activeTabIndex: idx,
        viewChunks: this.normalizeViewChunks(rawChunks),
        panelMetaLine: this.buildPanelMeta(bar, this.data.fetchedAtText),
        mainScrollTop: 0,
      });
    },

    /** WinCC 开关写入：仅超管；成功后合并 tagItems 单行（post-save-no-full-refresh.mdc） */
    onWinccSwitchTap(e) {
      const roleAccess = require('../../utils/roleAccess.js');
      const springAuth = require('../../utils/springAuth.js');
      const ds = e.currentTarget.dataset || {};
      const unk = ds.unk === true || ds.unk === 1 || ds.unk === '1';
      if (unk) {
        wx.showToast({ title: '状态未知', icon: 'none' });
        return;
      }
      const role = wx.getStorageSync(springAuth.KEYS.ROLE);
      if (!roleAccess.hasMinRole(role, 'SUPER_ADMIN')) {
        wx.showToast({ title: '需超级管理员', icon: 'none' });
        return;
      }
      const vn = pickTrim(ds.vn);
      if (!vn) return;
      const curOn = ds.on === true || ds.on === 1 || ds.on === '1';
      const nextVal = curOn ? 0 : 1;
      const page = this._telemetryPage;
      const raw = findTagItemByVariableName((page && page.tagItems) || [], vn);
      const switchKindRole = pickTrim(raw && raw.kindRole) || 'SWITCH';
      const main = winccSwitchConfirmContentMp(nextVal, raw);
      const lastFetch = pickTrim(this.data.fetchedAtText) || '—';
      this.setData({
        switchConfirmVisible: true,
        switchConfirmMain: main,
        switchConfirmLastFetchLine: `页面最近拉取：${lastFetch}`,
        switchConfirmVn: vn,
        switchConfirmNextVal: nextVal,
        switchConfirmKindRole: switchKindRole,
        switchConfirmRefreshing: false,
      });
    },

    /** 仅收起弹层；文案在 after-leave 再清，避免关窗动画时内容先空（壳子后收） */
    onSwitchConfirmSheetClose() {
      this.setData({
        switchConfirmVisible: false,
        switchConfirmRefreshing: false,
      });
    },

    onSwitchConfirmSheetAfterLeave() {
      if (this.data.switchConfirmVisible) return;
      this.setData({
        switchConfirmVn: '',
        switchConfirmMain: '',
        switchConfirmLastFetchLine: '',
        switchConfirmNextVal: 0,
        switchConfirmKindRole: 'SWITCH',
      });
    },

    /** 弹层内定点拉当前开关变量；合并单行禁止整表 load（post-save-no-full-refresh.mdc） */
    onSwitchConfirmSheetRefresh() {
      const api = require('../../utils/animalRoomTelemetryApi.js');
      const vn = pickTrim(this.data.switchConfirmVn);
      if (!vn || this.data.switchConfirmRefreshing) return;
      this.setData({ switchConfirmRefreshing: true });
      api
        .fetchTelemetryWinccSnapshot(true, { variableNames: vn })
        .then((snap) => {
          const items = (snap && snap.items) || [];
          let row = null;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it && pickTrim(it.variableName) === vn) {
              row = it;
              break;
            }
          }
          if (row) {
            this.triggerEvent('telemetrytagmerge', { row }, { bubbles: false });
          } else {
            wx.showToast({ title: '未读到该点', icon: 'none' });
          }
        })
        .catch((err) => {
          wx.showToast({ title: (err && (err.message || err.errMsg)) || '刷新失败', icon: 'none' });
        })
        .finally(() => {
          this.setData({ switchConfirmRefreshing: false });
        });
    },

    onSwitchConfirmSheetConfirm() {
      const api = require('../../utils/animalRoomTelemetryApi.js');
      const vn = pickTrim(this.data.switchConfirmVn);
      const nextVal = this.data.switchConfirmNextVal;
      const switchKindRole = pickTrim(this.data.switchConfirmKindRole) || 'SWITCH';
      if (!vn) {
        this.onSwitchConfirmSheetClose();
        return;
      }
      const self = this;
      this.onSwitchConfirmSheetClose();
      const preserveTabKey = getPreserveFloorTabKey(self);
      api
        .writeWinccTagAndVerify(vn, nextVal, switchKindRole)
        .then((row) => {
          const p = self._telemetryPage;
          if (p && Array.isArray(p.tagItems) && row && pickTrim(row.variableName)) {
            const vnx = pickTrim(row.variableName);
            p.tagItems = p.tagItems.map((it) =>
              pickTrim(it.variableName) === vnx ? Object.assign({}, it, row) : it
            );
          }
          wx.showToast({ title: '修改成功', icon: 'success' });
          self.applyTelemetryPage(p, { preserveTabKey });
        })
        .catch((err) => {
          wx.showToast({ title: (err && err.message) || '写入失败', icon: 'none' });
        });
    },

    /** 设定值：点击数值修改（与 Web：prompt 后 write-tag；需超管） */
    onSetpointTap(e) {
      const roleAccess = require('../../utils/roleAccess.js');
      const ds = e.currentTarget.dataset || {};
      const vn = pickTrim(ds.vn);
      if (!vn) return;
      const role = wx.getStorageSync(springAuth.KEYS.ROLE);
      if (!roleAccess.hasMinRole(role, 'SUPER_ADMIN')) {
        wx.showToast({ title: '需超级管理员', icon: 'none' });
        return;
      }
      const def = pickTrim(ds.cur) || '';
      const mkl = pickTrim(ds.mkl);
      const mkc = pickTrim(ds.mkc);
      let dl = pickTrim(ds.dl);
      if (!dl && this._telemetryPage) {
        const raw = findTagItemByVariableName((this._telemetryPage.tagItems) || [], vn);
        if (raw) dl = pickTrim(raw.displayLabel);
      }
      const paramHint = formatSetpointParamHintLine(dl, mkl, mkc);
      /** 不用 wx.showModal：editable 模式下 title 内 \\n 常被当成空格导致单行；统一 van-popup 才能保证两行版式 */
      this.openSetpointSheet(vn, def, paramHint);
    },

    /** 自定义弹窗：首行固定「修改设定值」（见 wxml），此处仅传映射名第二行 */
    openSetpointSheet(vn, draft, paramHint) {
      let hint = pickTrim(paramHint);
      if (!hint) {
        const raw =
          this._telemetryPage && findTagItemByVariableName((this._telemetryPage.tagItems) || [], pickTrim(vn));
        const dl = raw ? pickTrim(raw.displayLabel) : '';
        hint = formatSetpointParamHintLine(dl, '', '');
      }
      const lastFetch = pickTrim(this.data.fetchedAtText) || '—';
      this.setData({
        setpointSheetVisible: true,
        setpointSheetVn: pickTrim(vn),
        setpointSheetDraft: draft != null ? String(draft) : '',
        setpointSheetParamHint: hint,
        setpointSheetParamHintTier: setpointMapHintFontTier(hint),
        setpointSheetLastFetchLine: `页面最近拉取：${lastFetch}`,
        setpointSheetRefreshing: false,
      });
    },

    /** 仅收起弹层；表单字段在 after-leave 再清，与开关弹层一致 */
    onSetpointSheetClose() {
      this.setData({
        setpointSheetVisible: false,
        setpointSheetRefreshing: false,
      });
    },

    onSetpointSheetAfterLeave() {
      if (this.data.setpointSheetVisible) return;
      this.setData({
        setpointSheetVn: '',
        setpointSheetDraft: '',
        setpointSheetParamHint: '',
        setpointSheetParamHintTier: '',
        setpointSheetLastFetchLine: '',
      });
    },

    /** 弹层内定点拉当前设定变量；合并单行禁止整表 load（post-save-no-full-refresh.mdc） */
    onSetpointSheetRefresh() {
      const api = require('../../utils/animalRoomTelemetryApi.js');
      const vn = pickTrim(this.data.setpointSheetVn);
      if (!vn || this.data.setpointSheetRefreshing) return;
      this.setData({ setpointSheetRefreshing: true });
      api
        .fetchTelemetryWinccSnapshot(true, { variableNames: vn })
        .then((snap) => {
          const items = (snap && snap.items) || [];
          let row = null;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it && pickTrim(it.variableName) === vn) {
              row = it;
              break;
            }
          }
          if (row) {
            this.triggerEvent('telemetrytagmerge', { row }, { bubbles: false });
          } else {
            wx.showToast({ title: '未读到该点', icon: 'none' });
          }
        })
        .catch((err) => {
          wx.showToast({ title: (err && (err.message || err.errMsg)) || '刷新失败', icon: 'none' });
        })
        .finally(() => {
          this.setData({ setpointSheetRefreshing: false });
        });
    },

    onSetpointSheetInput(e) {
      this.setData({ setpointSheetDraft: e.detail.value });
    },

    onSetpointSheetConfirm() {
      const roleAccess = require('../../utils/roleAccess.js');
      const role = wx.getStorageSync(springAuth.KEYS.ROLE);
      if (!roleAccess.hasMinRole(role, 'SUPER_ADMIN')) return;
      const vn = pickTrim(this.data.setpointSheetVn);
      if (!vn) {
        this.onSetpointSheetClose();
        return;
      }
      const draft = this.data.setpointSheetDraft;
      const self = this;
      this.onSetpointSheetClose();
      winccWriteThenApply(self, vn, draft).catch(() => {});
    },

    buildMetricDetail(raw, ds) {
      const roleAccess = require('../../utils/roleAccess.js');
      const dl = raw ? pickTrim(raw.displayLabel) : pickTrim(ds.dl);
      const amin = raw ? pickTrim(raw.alarmMinValue) : pickTrim(ds.amin);
      const amax = raw ? pickTrim(raw.alarmMaxValue) : pickTrim(ds.amax);
      const aminVn = raw ? pickTrim(raw.alarmMinVariableName) : '';
      const amaxVn = raw ? pickTrim(raw.alarmMaxVariableName) : '';
      const vn = raw ? pickTrim(raw.variableName) : pickTrim(ds.vn);
      const q = raw ? pickTrim(raw.qualityCode) : '';
      const err = raw ? pickTrim(raw.error) : '';
      const mkc = raw ? pickTrim(raw.metricKindCode) : pickTrim(ds.mkc);
      const mkl = raw ? pickTrim(raw.metricKindLabel) : pickTrim(ds.mkl);
      const valueRaw = raw && raw.value != null && String(raw.value).trim() !== '' ? String(raw.value) : '';
      const isSp = raw ? isSetpointKind(raw, mkc) : pickTrim(mkc).toUpperCase() === 'SETPOINT';
      const rc = raw ? pickTrim(raw.roomCanonical) : '';
      const roomPart = mpFacilitySuiteOrdinalOrStripRoomDisplay(rc);
      const labelForHint = pickTrim(mkl) || pickTrim(mkc) || '设定值';
      const setpointRowLabel = isSp && roomPart ? `${roomPart} · ${labelForHint}` : labelForHint;
      const mapHintLine = stripSetpointMapTailAfterLastDash(dl || setpointRowLabel);
      const mapHintTier = setpointMapHintFontTier(mapHintLine);
      const role = wx.getStorageSync(springAuth.KEYS.ROLE);
      const canWriteSetpoint =
        isSp && roleAccess.hasMinRole(role, 'SUPER_ADMIN') && vn.length > 0 && pickTrim(vn) !== '—';
      const { displayCore, unitSlot } = parseMetricUnitParts(mkc, mkl, valueRaw);
      const displayWithUnit = composeDisplayWithUnit(displayCore, unitSlot);
      const labIcon = metricLabIconForSlot(unitSlot || computeMetricUnitSlot(mkc, mkl));
      const bandClass = raw ? alarmBandClass(raw) : '';
      const bc = raw ? pickTrim(raw.bundleCode) : '';
      const tid = raw && raw.watchlistTagId != null ? raw.watchlistTagId : null;
      const ovm = raw ? pickTrim(raw.alarmOverrideMin) : '';
      const ovx = raw ? pickTrim(raw.alarmOverrideMax) : '';
      return {
        metricKindLabel: mkl,
        metricKindCode: mkc,
        valueRaw,
        displayCore,
        unitSlot,
        displayWithUnit,
        bandClass,
        labIcon,
        tsText: formatTelemetryTs(raw ? raw.timestamp : null),
        displayLabel: dl,
        showDisplayLabel: dl.length > 0,
        showAlarm: !!(amin || amax),
        alarmMin: amin,
        alarmMax: amax,
        showAminVn: aminVn.length > 0,
        alarmMinVn: aminVn,
        showAmaxVn: amaxVn.length > 0,
        alarmMaxVn: amaxVn,
        variableName: vn || '—',
        qualityCode: q,
        showQuality: q.length > 0,
        error: err,
        showError: err.length > 0,
        archiveSummary: '',
        archiveChartReady: false,
        archiveChartImage: '',
        archiveChartGenFailed: false,
        bundleCode: bc,
        watchlistTagId: tid,
        canSaveOverride: !!(bc && tid != null),
        overrideMinDraft: ovm,
        overrideMaxDraft: ovx,
        overrideEditWhich: '',
        isSetpoint: isSp,
        canWriteSetpoint,
        setpointEditActive: false,
        setpointDraft: valueRaw,
        setpointRowLabel,
        setpointMapHintLine: mapHintLine,
        setpointMapHintTier: mapHintTier,
      };
    },

    /**
     * 离屏 canvas 绘制近窗归档曲线（与 Web Recharts：X 时轴 + 数据峰谷 ReferenceLine 虚线），导出 tempPath 供弹窗内 image，避免原生 canvas 压盖。
     */
    exportArchiveTrendImage(series, metricDetail) {
      const self = this;
      const W = 342;
      const H = 176;
      const padL = 54;
      const padR = 8;
      const padT = 10;
      const padB = 26;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;

      const rows = (series && series.points) || [];
      const prepared = rows
        .map((p) => ({ tMs: Date.parse(p.t), v: Number(p.value) }))
        .filter((r) => Number.isFinite(r.tMs) && Number.isFinite(r.v));
      if (prepared.length < 2) {
        self.setData({ 'metricDetail.archiveChartImage': '', 'metricDetail.archiveChartGenFailed': false });
        return;
      }
      prepared.sort((a, b) => a.tMs - b.tMs);

      let xMin = NaN;
      let xMax = NaN;
      const qf = series.queriedFrom ? Date.parse(series.queriedFrom) : NaN;
      const qt = series.queriedTo ? Date.parse(series.queriedTo) : NaN;
      if (Number.isFinite(qf) && Number.isFinite(qt)) {
        xMin = Math.min(qf, qt);
        xMax = Math.max(qf, qt);
      } else {
        const tms = prepared.map((r) => r.tMs);
        xMin = Math.min(...tms);
        xMax = Math.max(...tms);
      }
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) {
        const tms = prepared.map((r) => r.tMs);
        xMin = Math.min(...tms);
        xMax = Math.max(...tms);
      }

      const dataMin = Math.min(...prepared.map((r) => r.v));
      const dataMax = Math.max(...prepared.map((r) => r.v));
      let yMin = dataMin;
      let yMax = dataMax;
      const yPad = Math.max((dataMax - dataMin) * 0.08, 0.35);
      yMin -= yPad;
      yMax += yPad;
      const ySpan = yMax - yMin || 1;
      const xSpan = xMax - xMin || 1;

      function xToPx(tMs) {
        return padL + ((tMs - xMin) / xSpan) * plotW;
      }
      function yToPx(v) {
        return padT + plotH - ((v - yMin) / ySpan) * plotH;
      }
      function fmtTick(ms) {
        const d = new Date(ms);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      function dataExtremaLabel(num) {
        if (!Number.isFinite(num)) return '';
        return num.toFixed(1);
      }
      const labelLo = dataExtremaLabel(dataMin);
      const labelHi = dataExtremaLabel(dataMax);

      function drawLimitRefLine(c2, v) {
        if (!Number.isFinite(v)) return;
        const py = yToPx(v);
        if (py < padT - 1 || py > padT + plotH + 1) return;
        c2.save();
        c2.strokeStyle = '#94a3b8';
        c2.lineWidth = 1;
        c2.setLineDash([4, 3]);
        c2.beginPath();
        c2.moveTo(padL, py);
        c2.lineTo(padL + plotW, py);
        c2.stroke();
        c2.restore();
      }

      function drawLimitLeftLabel(c2, py, prefix, valueText) {
        if (!valueText) return;
        const t = `${prefix}${valueText}`;
        c2.save();
        c2.font = '9px sans-serif';
        c2.fillStyle = '#64748b';
        c2.textAlign = 'right';
        c2.textBaseline = 'middle';
        c2.fillText(t, padL - 4, py);
        c2.restore();
      }

      wx.nextTick(() => {
        setTimeout(() => {
          wx.createSelectorQuery()
            .in(self)
            .select('#artArchiveOffscreenCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
              if (!res || !res[0] || !res[0].node) {
                self.setData({
                  'metricDetail.archiveChartImage': '',
                  'metricDetail.archiveChartGenFailed': true,
                });
                return;
              }
              const canvas = res[0].node;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                self.setData({
                  'metricDetail.archiveChartImage': '',
                  'metricDetail.archiveChartGenFailed': true,
                });
                return;
              }
              const dpr = Math.min(2.75, Math.max(1, (wx.getSystemInfoSync() && wx.getSystemInfoSync().pixelRatio) || 2));
              canvas.width = W * dpr;
              canvas.height = H * dpr;
              ctx.scale(dpr, dpr);

              ctx.fillStyle = '#fafafa';
              ctx.fillRect(0, 0, W, H);

              const pyLo = yToPx(dataMin);
              const pyHi = yToPx(dataMax);

              drawLimitRefLine(ctx, dataMin);
              drawLimitRefLine(ctx, dataMax);

              ctx.strokeStyle = '#e4e4e7';
              ctx.lineWidth = 1;
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(padL, padT + plotH);
              ctx.lineTo(padL + plotW, padT + plotH);
              ctx.stroke();

              ctx.strokeStyle = '#0ea5e9';
              ctx.lineWidth = 2;
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.setLineDash([]);
              ctx.beginPath();
              prepared.forEach((r, i) => {
                const x = xToPx(r.tMs);
                const y = yToPx(r.v);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.stroke();

              const labelOffset = 11;
              if (labelLo) {
                let yLbl = pyLo;
                if (Math.abs(pyHi - pyLo) < 16) {
                  yLbl = Math.min(pyLo, pyHi) + labelOffset;
                }
                drawLimitLeftLabel(ctx, yLbl, '最小 ', labelLo);
              }
              if (labelHi) {
                let yLbl = pyHi;
                if (Math.abs(pyHi - pyLo) < 16) {
                  yLbl = Math.max(pyLo, pyHi) - labelOffset;
                }
                drawLimitLeftLabel(ctx, yLbl, '最大 ', labelHi);
              }

              ctx.fillStyle = '#71717a';
              ctx.font = '10px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(fmtTick(xMin), padL + 24, padT + plotH + 4);
              ctx.textAlign = 'center';
              ctx.fillText(fmtTick(xMax), padL + plotW - 24, padT + plotH + 4);

              const exportPng = () => {
                wx.canvasToTempFilePath(
                  {
                    canvas,
                    width: W * dpr,
                    height: H * dpr,
                    destWidth: W * dpr,
                    destHeight: H * dpr,
                    fileType: 'png',
                    success: (r2) => {
                      const pth = r2 && r2.tempFilePath;
                      if (pth) {
                        self.setData({
                          'metricDetail.archiveChartImage': pth,
                          'metricDetail.archiveChartGenFailed': false,
                        });
                      } else {
                        self.setData({
                          'metricDetail.archiveChartImage': '',
                          'metricDetail.archiveChartGenFailed': true,
                        });
                      }
                    },
                    fail: () => {
                      self.setData({
                        'metricDetail.archiveChartImage': '',
                        'metricDetail.archiveChartGenFailed': true,
                      });
                    },
                  },
                  self
                );
              };
              if (typeof canvas.requestAnimationFrame === 'function') {
                canvas.requestAnimationFrame(exportPng);
              } else {
                wx.nextTick(exportPng);
              }
            });
        }, 120);
      });
    },

    onMetricTap(e) {
      const ds = {
        vn: e.currentTarget.dataset.vn,
        dl: e.currentTarget.dataset.dl,
        amin: e.currentTarget.dataset.amin,
        amax: e.currentTarget.dataset.amax,
        mkl: e.currentTarget.dataset.mkl,
        mkc: e.currentTarget.dataset.mkc,
      };
      const page = this._telemetryPage;
      const items = (page && page.tagItems) || [];
      const raw = findTagItemByVariableName(items, ds.vn);
      const metricDetail = this.buildMetricDetail(raw, ds);
      const self = this;
      this.setData({
        metricDetailVisible: true,
        metricDetail,
        'metricDetail.archiveSummary': '加载中…',
        'metricDetail.archiveChartReady': false,
        'metricDetail.archiveChartImage': '',
        'metricDetail.archiveChartGenFailed': false,
      });
      const vn = pickTrim(metricDetail.variableName);
      if (!vn || vn === '—') return;
      const api = require('../../utils/animalRoomTelemetryApi.js');
      api
        .fetchTelemetryArchiveSeriesRolling(vn, 6, 80)
        .then((series) => {
          const ptsRaw = (series && series.points) || [];
          const pts = ptsRaw.filter((p) => p != null && Number.isFinite(Number(p.value)));
          const summary = ptsRaw.length ? `近6h ${ptsRaw.length} 点` : '近6h 无归档点';
          const chartOk = pts.length >= 2;
          self.setData({ 'metricDetail.archiveSummary': summary, 'metricDetail.archiveChartReady': chartOk }, () => {
            if (chartOk) self.exportArchiveTrendImage(series, self.data.metricDetail);
          });
        })
        .catch(() => {
          self.setData({
            'metricDetail.archiveSummary': '归档摘要不可用',
            'metricDetail.archiveChartReady': false,
            'metricDetail.archiveChartImage': '',
            'metricDetail.archiveChartGenFailed': false,
          });
        });
    },

    refreshMetricDetailPreserveArchive(vn) {
      const page = this._telemetryPage;
      const md = this.data.metricDetail;
      const raw = findTagItemByVariableName((page && page.tagItems) || [], vn);
      const rebuilt = this.buildMetricDetail(raw, {
        vn: md.variableName,
        dl: md.displayLabel,
        amin: md.alarmMin,
        amax: md.alarmMax,
        mkl: md.metricKindLabel,
        mkc: md.metricKindCode,
      });
      this.setData({
        metricDetail: {
          ...rebuilt,
          archiveSummary: md.archiveSummary,
          archiveChartReady: md.archiveChartReady,
          archiveChartImage: md.archiveChartImage,
          archiveChartGenFailed: md.archiveChartGenFailed,
        },
      });
    },

    onMetricDetailSetpointTap() {
      const md = this.data.metricDetail;
      if (!md.canWriteSetpoint) return;
      this.setData({
        'metricDetail.setpointEditActive': true,
        'metricDetail.setpointDraft': md.valueRaw,
      });
    },

    onMetricDetailSetpointDraftInput(e) {
      this.setData({ 'metricDetail.setpointDraft': e.detail.value });
    },

    onMetricDetailSetpointCancel() {
      const md = this.data.metricDetail;
      this.setData({
        'metricDetail.setpointEditActive': false,
        'metricDetail.setpointDraft': md.valueRaw,
      });
    },

    onMetricDetailSetpointSubmit() {
      const roleAccess = require('../../utils/roleAccess.js');
      const role = wx.getStorageSync(springAuth.KEYS.ROLE);
      if (!roleAccess.hasMinRole(role, 'SUPER_ADMIN')) {
        wx.showToast({ title: '需超级管理员', icon: 'none' });
        return;
      }
      const md = this.data.metricDetail;
      const vn = pickTrim(md.variableName);
      if (!vn || vn === '—') return;
      const self = this;
      winccWriteThenApply(this, vn, md.setpointDraft)
        .then(() => {
          self.refreshMetricDetailPreserveArchive(vn);
        })
        .catch(() => {});
    },

    onOverrideMinInput(e) {
      this.setData({ 'metricDetail.overrideMinDraft': e.detail.value });
    },

    onOverrideMaxInput(e) {
      this.setData({ 'metricDetail.overrideMaxDraft': e.detail.value });
    },

    onAlarmLimitTap(e) {
      const which = e.currentTarget.dataset.which;
      if (which !== 'min' && which !== 'max') return;
      if (!this.data.metricDetail.canSaveOverride) return;
      this.setData({ 'metricDetail.overrideEditWhich': which });
    },

    onOverrideEditCancel() {
      const md = this.data.metricDetail;
      const page = this._telemetryPage;
      const items = (page && page.tagItems) || [];
      const raw = findTagItemByVariableName(items, pickTrim(md.variableName));
      const rebuilt = this.buildMetricDetail(raw, {
        vn: md.variableName,
        dl: md.displayLabel,
        amin: md.alarmMin,
        amax: md.alarmMax,
        mkl: md.metricKindLabel,
        mkc: md.metricKindCode,
      });
      this.setData({
        'metricDetail.overrideEditWhich': '',
        'metricDetail.overrideMinDraft': rebuilt.overrideMinDraft,
        'metricDetail.overrideMaxDraft': rebuilt.overrideMaxDraft,
      });
    },

    onSaveAlarmOverrides() {
      const self = this;
      const md = this.data.metricDetail;
      if (!md.canSaveOverride) return;
      const api = require('../../utils/animalRoomTelemetryApi.js');
      const vn = pickTrim(md.variableName);
      wx.showLoading({ title: '保存中', mask: true });
      let savedRow = null;
      api
        .patchWatchlistTagAlarmOverrides(md.bundleCode, md.watchlistTagId, md.overrideMinDraft, md.overrideMaxDraft)
        .then((saved) => {
          savedRow = saved;
          return api.queryWatchlistAlarmLimits([vn], { [vn]: md.valueRaw || '' });
        })
        .then((batch) => {
          const entry = (batch && batch.byVariableName && batch.byVariableName[vn]) || {};
          const page = self._telemetryPage;
          if (page && page.tagItems && vn) {
            // 保存后仅合并当前行，禁止整页重拉（post-save-no-full-refresh.mdc）
            page.tagItems = page.tagItems.map((it) => {
              if (pickTrim(it.variableName) !== vn) return it;
              return {
                ...it,
                alarmMinValue: entry.alarmMinValue != null ? entry.alarmMinValue : it.alarmMinValue,
                alarmMaxValue: entry.alarmMaxValue != null ? entry.alarmMaxValue : it.alarmMaxValue,
                alarmOutOfRange: entry.alarmOutOfRange != null ? entry.alarmOutOfRange : it.alarmOutOfRange,
                alarmBand: entry.alarmBand != null ? entry.alarmBand : it.alarmBand,
                alarmOverrideMin: savedRow && savedRow.alarmOverrideMin != null ? savedRow.alarmOverrideMin : it.alarmOverrideMin,
                alarmOverrideMax: savedRow && savedRow.alarmOverrideMax != null ? savedRow.alarmOverrideMax : it.alarmOverrideMax,
              };
            });
          }
          wx.hideLoading();
          wx.showToast({ title: '已保存', icon: 'success' });
          self.setData({ metricDetailVisible: false, 'metricDetail.overrideEditWhich': '' });
          const preserveTabKey = getPreserveFloorTabKey(self);
          wx.nextTick(() => {
            self.applyTelemetryPage(page, { preserveTabKey });
          });
        })
        .catch((e) => {
          wx.hideLoading();
          wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
        });
    },

    onMetricDetailClose() {
      const p = this._telemetryPage;
      this.setData({
        metricDetailVisible: false,
        'metricDetail.overrideEditWhich': '',
        'metricDetail.setpointEditActive': false,
        'metricDetail.archiveChartReady': false,
        'metricDetail.archiveChartImage': '',
        'metricDetail.archiveChartGenFailed': false,
      });
      if (p && Array.isArray(p.tabs)) {
        const preserveTabKey = getPreserveFloorTabKey(this);
        wx.nextTick(() => {
          this.applyTelemetryPage(p, { preserveTabKey });
        });
      }
    },
  },
});
