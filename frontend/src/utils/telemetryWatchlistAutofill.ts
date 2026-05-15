/**
 * WinCC 变量管理表：仅根据「展示映射」文本推断楼层 / 房间 / 类别（不使用「名称」列变量名）。
 * 展示映射为空或「无」时不做任何推断。套间归并见 {@link normalizeRoomForGrouping}。
 */

export type InferredStructured = {
  floorCode: string | null;
  roomCanonical: string | null;
  metricKindCode: string | null;
};

/** 指标字典中的条目（与后端 telemetry_metric_kind 对齐即可） */
export type MetricKindHint = {
  code: string;
  labelZh?: string | null;
};

function normalizeFloorToken(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const lower = s.toLowerCase();
  const mNum = lower.match(/^(\d+)f$/);
  if (mNum) return `${mNum[1]}F`;
  const mB = lower.match(/^b(\d*)f$/);
  if (mB) return `B${mB[1] ?? ""}F`;
  const mM = lower.match(/^m(\d+)f$/);
  if (mM) return `M${mM[1]}F`;
  return s;
}

/** 与快照分组一致：末尾「数字+拉丁字母」视为套间后缀，如 2F-201A→2F-201、201B→201；洁净走道1 等不变。 */
export function normalizeRoomForGrouping(room: string): string {
  const s = (room || "").trim();
  if (!s) return s;
  return s.replace(/(\d+)([A-Za-z]+)$/, "$1");
}

/** 去掉尾部指标用语：硬编码温湿压 + 指标字典全部 label_zh（最长优先，可多轮）。 */
function stripTrailingMetricLabelsFromDisplayBody(
  displayBody: string,
  kinds: MetricKindHint[] | null | undefined
): string {
  let s = displayBody.trim();
  s = s
    .replace(
      /(?:[-·.\s]+|\s*)(压力|压差|压强|温度|湿度|气温|RH|开关|设定值|启停|通断|给定值|目标值|状态)\s*$/i,
      ""
    )
    .trim();

  const labels = (kinds ?? [])
    .map((k) => (k.labelZh || "").trim())
    .filter((lz) => lz.length > 0)
    .sort((a, b) => b.length - a.length);

  let changed = true;
  while (changed) {
    changed = false;
    for (const lz of labels) {
      const escaped = lz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?:[-·.\\s]+|\\s*)${escaped}\\s*$`);
      const next = s.replace(re, "").trim();
      if (next !== s) {
        s = next;
        changed = true;
        break;
      }
    }
  }
  return s;
}

/** 字典 label_zh 若带说明括号（如「开关（读写值）」），展示映射常只写括号前简称，须一并参与匹配。 */
function metricKindLabelVariants(labelZh: string): string[] {
  const lz = labelZh.trim();
  if (!lz) return [];
  const head = lz.split(/[（(]/)[0]?.trim() ?? lz;
  const out: string[] = [];
  if (lz) out.push(lz);
  if (head && head !== lz) out.push(head);
  return out;
}

function inferMetricKindFromDisplayOnly(dl: string, kinds: MetricKindHint[] | null | undefined): string | null {
  const pairs: { code: string; fragment: string }[] = [];
  for (const k of kinds ?? []) {
    const code = (k.code || "").trim();
    if (!code) continue;
    for (const fragment of metricKindLabelVariants((k.labelZh || "").trim())) {
      if (fragment.length > 0) pairs.push({ code, fragment });
    }
  }
  if (!pairs.length) return null;
  pairs.sort((a, b) => b.fragment.length - a.fragment.length);
  for (const { code, fragment } of pairs) {
    if (dl.includes(fragment)) return code;
  }
  return null;
}

/**
 * 仅从展示映射推断楼层 / 房间 / 类别（不读取 WinCC 变量「名称」列）。
 * 展示映射为空或为「无」时返回三项 null。
 */
export function inferStructuredFromDisplayMapping(input: {
  displayLabel: string | null | undefined;
  metricKinds?: MetricKindHint[] | null;
}): InferredStructured {
  const dlRaw = (input.displayLabel || "").trim();
  const dl = dlRaw === "无" ? "" : dlRaw;
  if (!dl) {
    return { floorCode: null, roomCanonical: null, metricKindCode: null };
  }

  let metricKindCode: string | null = null;
  if (/(压差|压力|压强)/.test(dl)) metricKindCode = "PRESSURE";
  if (/湿度|\bRH\b/i.test(dl)) metricKindCode = metricKindCode ?? "HUM";
  if (/温度|气温|℃/.test(dl)) metricKindCode = metricKindCode ?? "TEMP";
  if (/(开关|启停|通断)/.test(dl)) metricKindCode = metricKindCode ?? "SWITCH";
  if (/(设定值|给定值|目标值)/.test(dl)) metricKindCode = metricKindCode ?? "SETPOINT";
  if (/状态/.test(dl)) metricKindCode = metricKindCode ?? "STATUS";

  if (!metricKindCode) {
    const fromDict = inferMetricKindFromDisplayOnly(dl, input.metricKinds);
    if (fromDict) metricKindCode = fromDict;
  }

  let floorCode: string | null = null;
  let roomCanonical: string | null = null;

  const body = stripTrailingMetricLabelsFromDisplayBody(dl, input.metricKinds);

  const mDash = body.match(/^([0-9]+F|B\d*F|M\d+F)\s*[-·]\s*(.+)$/i);
  if (mDash) {
    floorCode = normalizeFloorToken(mDash[1]);
    roomCanonical = (mDash[2] || "").trim() || null;
  } else {
    const mPrefix = body.match(/^([0-9]+F|B\d*F|M\d+F)\s+/i);
    if (mPrefix) {
      floorCode = normalizeFloorToken(mPrefix[1]);
      roomCanonical = body.slice(mPrefix[0].length).trim() || null;
    }
  }

  return { floorCode, roomCanonical, metricKindCode };
}
