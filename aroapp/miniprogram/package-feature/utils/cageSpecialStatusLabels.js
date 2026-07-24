/**
 * 笼位特殊状态标准名称 — 与后端 SpecialStatusComputer.java 对齐。
 * 禁止自行缩写（如「合笼」「请分笼」「健康异常」）。
 */
var SPECIAL_STATUS_LABELS = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
  ANIMAL_TRANSFER: "动物转移",
  NORMAL: "正常"
};

var STATUS_BG_PRIORITY = [
  "HEALTH_ABNORMAL", "NEED_DIVIDE", "ANIMAL_TRANSFER",
  "SPECIAL_FEEDING", "COHABITATION", "NORMAL"
];

function resolveSpecialStatusLabel(code, apiLabel) {
  var trimmed = apiLabel != null ? String(apiLabel).trim() : "";
  if (trimmed) return trimmed;
  return SPECIAL_STATUS_LABELS[code] || code;
}

function formatSpecialStatusDisplayLabel(entries) {
  var nonNormal = [];
  for (var i = 0; i < (entries || []).length; i++) {
    if (entries[i].code !== "NORMAL") nonNormal.push(entries[i]);
  }
  if (nonNormal.length === 0) return "";
  return nonNormal.map(function(s) {
    return resolveSpecialStatusLabel(s.code, s.label);
  }).join("·");
}

function specialStatusLabelsFromCageBoxInfo(cageBoxInfo) {
  if (!cageBoxInfo) return [];
  var labels = [];
  var yn = function(k) { return cageBoxInfo[k] === 1 || cageBoxInfo[k] === "1"; };
  var hasText = function(k) {
    return typeof cageBoxInfo[k] === "string" && String(cageBoxInfo[k]).trim() !== "";
  };
  if (hasText("ClosingDate") || hasText("closingdate")) {
    labels.push(SPECIAL_STATUS_LABELS.COHABITATION);
  }
  if (yn("NeedFeedingYn") || yn("needFeedingYn")) {
    labels.push(SPECIAL_STATUS_LABELS.SPECIAL_FEEDING);
  }
  if (yn("NeedDivideYn") || yn("needDivideYn")) {
    labels.push(SPECIAL_STATUS_LABELS.NEED_DIVIDE);
  }
  if (yn("AbnormalHealthYn") || yn("abnormalHealthYn")) {
    labels.push(SPECIAL_STATUS_LABELS.HEALTH_ABNORMAL);
  }
  if (yn("NeedTransferYn") || yn("needTransferYn")) {
    labels.push(SPECIAL_STATUS_LABELS.ANIMAL_TRANSFER);
  }
  return labels;
}

function formatSpecialStatusCodesForDisplay(specialStatuses, cageBoxInfo) {
  var list = [];
  if (specialStatuses && specialStatuses.length) {
    for (var i = 0; i < specialStatuses.length; i++) {
      if (specialStatuses[i].code !== "NORMAL") list.push(specialStatuses[i]);
    }
  }
  if (list.length > 0) {
    return list.map(function(s) {
      return resolveSpecialStatusLabel(s.code, s.label);
    }).join("+");
  }
  var fallback = specialStatusLabelsFromCageBoxInfo(cageBoxInfo);
  return fallback.length > 0 ? fallback.join("+") : "";
}

function buildSpecialStatusEntriesFromCageBoxInfo(cageBoxInfo) {
  if (!cageBoxInfo) return [];
  var results = [];
  var yn = function(k) { return cageBoxInfo[k] === 1 || cageBoxInfo[k] === "1"; };
  var hasText = function(k) {
    return typeof cageBoxInfo[k] === "string" && String(cageBoxInfo[k]).trim() !== "";
  };
  if (hasText("ClosingDate") || hasText("closingdate")) {
    results.push({ code: "COHABITATION", label: SPECIAL_STATUS_LABELS.COHABITATION });
  }
  if (yn("NeedFeedingYn") || yn("needFeedingYn")) {
    results.push({ code: "SPECIAL_FEEDING", label: SPECIAL_STATUS_LABELS.SPECIAL_FEEDING });
  }
  if (yn("NeedDivideYn") || yn("needDivideYn")) {
    results.push({ code: "NEED_DIVIDE", label: SPECIAL_STATUS_LABELS.NEED_DIVIDE });
  }
  if (yn("AbnormalHealthYn") || yn("abnormalHealthYn")) {
    results.push({ code: "HEALTH_ABNORMAL", label: SPECIAL_STATUS_LABELS.HEALTH_ABNORMAL });
  }
  if (yn("NeedTransferYn") || yn("needTransferYn")) {
    results.push({ code: "ANIMAL_TRANSFER", label: SPECIAL_STATUS_LABELS.ANIMAL_TRANSFER });
  }
  if (results.length === 0) {
    results.push({ code: "NORMAL", label: SPECIAL_STATUS_LABELS.NORMAL });
  }
  return results;
}

module.exports = {
  SPECIAL_STATUS_LABELS: SPECIAL_STATUS_LABELS,
  STATUS_BG_PRIORITY: STATUS_BG_PRIORITY,
  resolveSpecialStatusLabel: resolveSpecialStatusLabel,
  formatSpecialStatusDisplayLabel: formatSpecialStatusDisplayLabel,
  specialStatusLabelsFromCageBoxInfo: specialStatusLabelsFromCageBoxInfo,
  formatSpecialStatusCodesForDisplay: formatSpecialStatusCodesForDisplay,
  buildSpecialStatusEntriesFromCageBoxInfo: buildSpecialStatusEntriesFromCageBoxInfo
};
