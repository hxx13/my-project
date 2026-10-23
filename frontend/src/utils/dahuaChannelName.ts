/**
 * 大华通道命名规则：目标格式 `楼层-名称(房间号)-方位-常开/常闭-编号`。
 * 平台原名多为 `名称-方位-楼层-编号`（如 `饲养室-C(201-C)-2F-RD1-MK02`），需重排 + 归一化。
 * 判定口径：括号内的数字是房号；括号外的数字、GY4F/GYB1F、SY/RD/MK/RL 段都归「编号」。
 */
const CODE_SEG = "(?:GY(?:B?\\d+F)|B?\\d+F|\\d+|SY|RD\\d+|MK\\d+|RL\\d+)";
const CODE_TAIL_ONLY_RE = new RegExp(`^${CODE_SEG}(?:-${CODE_SEG})*_?$`);
const NAME_FLOOR_RE = /^(B?\d+F)(?![0-9F])/; // 名称开头的楼层，如 `B1F污梯厅`
const TAIL_FLOOR_RE = /^(B?\d+F)(?:-|$)/; // 编号段开头的楼层，不含 GY 前缀
/** 视频通道：代码段以 `JK+编号` 结尾，前面可能带空格（`GY3F- JK35`），楼层可能粘在后面（`JK11B1F`） */
const VIDEO_CODE_RE = /^(.*?JK\s*\d+(?:-\d+)?)\s*(.*)$/i;

export interface ParsedChannelName {
  floor: string;
  name: string;
  code: string;
}

/** 房间号归一：`-C(201-C)` → `(201C)`，`(205-B)` → `(205B)` */
function normalizeRoom(text: string): string {
  return text
    .replace(/-([A-Z])\((\d+)-([A-Z])\)/g, "($2$1)")
    .replace(/-([A-Z])\((\d+)\)/g, "($2$1)")
    .replace(/\((\d+)-([A-Z])\)/g, "($1$2)");
}

/** 从名称/房号推断楼层：地下室段 `E10-B106` → B1F，房号首字 `(465)` → 4F */
function inferFloorFromText(text: string): string {
  const basement = text.match(/(?:^|[-\s(])B(\d)/i);
  if (basement) return `B${basement[1]}F`;
  const room = text.match(/\(([^)]*)\)/);
  if (room) {
    const digits = room[1].match(/(\d{3,})/);
    if (digits) return `${digits[1][0]}F`;
  }
  return "";
}

export function parseChannelName(raw: string): ParsedChannelName {
  const n = (raw || "").replace(/（/g, "(").replace(/）/g, ")");
  // 视频通道：`RD1-JK01 1F缓冲间(123)` / `GY3F- JK35 3F样品暂存(新)` / `GYB1F-JK11B1F 实验室(...)`
  const vc = n.match(VIDEO_CODE_RE);
  if (vc && vc[2].trim()) {
    let code = vc[1].replace(/\s+/g, "");
    let rest = vc[2].trim();
    let floor = "";
    const leadingFloor = rest.match(/^(B?\d+F)(?![0-9F])/);
    if (leadingFloor) {
      floor = leadingFloor[1];
      rest = rest.slice(floor.length).trim();
    } else if (/^F(?![0-9])/i.test(rest) && /\d$/.test(code)) {
      // 楼层与编号粘在一起（`JK474F分子实验室`）：正则多吃了一位，吐回去当楼层
      floor = `${code.slice(-1)}F`;
      code = code.slice(0, -1);
      rest = rest.slice(1).trim();
    }
    const name = normalizeRoom(rest);
    return { floor: floor || inferFloorFromText(name), name, code };
  }
  let tail = "";
  // 从每个 `-` / `)` 处分一次，找最早一段能被完整解析成编号的尾部。
  // 不能只看最左匹配：`污染通道2-2F-RD2-MK02` 的最左匹配会从名称里的 `2` 开始，整条被误判成“没编号”。
  for (let i = 1; i < n.length; i++) {
    if (n[i - 1] !== "-" && n[i - 1] !== ")") continue;
    const cand = n.slice(i);
    if (CODE_TAIL_ONLY_RE.test(cand)) {
      tail = cand;
      break;
    }
  }
  let head = tail ? n.slice(0, n.length - tail.length).replace(/[-_]+$/, "") : n;

  let floor = "";
  const nameFloor = head.match(NAME_FLOOR_RE);
  if (nameFloor) {
    floor = nameFloor[1];
    head = head.slice(floor.length).replace(/^[-_\s]+/, "");
  }
  let code = tail.replace(/_+$/, "");
  if (!floor) {
    const tailFloor = code.match(TAIL_FLOOR_RE);
    if (tailFloor) {
      floor = tailFloor[1];
      code = code.slice(floor.length).replace(/^-+/, "");
    }
  }
  // 没有独立楼层时，从 GY 段借楼层：`GY4F` → `4F`（GY4F 本身仍留在编号里）
  if (!floor) {
    const gyFloor = code.match(/^GY(B?\d+F)(?:-|$)/);
    if (gyFloor) floor = gyFloor[1];
  }
  // 仍然没有楼层时，按房号推断：`(465)` → 4F，`(228)` → 2F，`(E10-B106)` → B1F
  if (!floor) floor = inferFloorFromText(head);
  // 房号能反推楼层时以房号为准：`13F-空调机房(334)-…` 的 13F 是错的，334 在 3F
  const roomFloor = inferFloorFromText(head);
  if (roomFloor && roomFloor !== floor) floor = roomFloor;
  // 括号外的尾部数字属于编号：`空调机房(128)-东门136-MK02` → 名称 `…-东门`、编号 `136-MK02`
  const glued = head.match(/^(.*[^\d\s])(\d+)$/);
  if (glued) {
    head = glued[1];
    code = [glued[2], code].filter(Boolean).join("-");
  }
  // 房间号归一：`-C(201-C)` → `(201C)`，`(205-B)` → `(205B)`
  head = normalizeRoom(head);
  return { floor, name: head, code };
}

/** 显示名：只留「名称(房间号)-方位」，楼层与编号不显示。不丢平台任何字节。 */
export function displayChannelName(raw: string): string {
  return parseChannelName(raw).name || raw;
}

/** 门禁卡片用：显示「楼层-名称」，编号不显示 */
export function displayFloorAndName(raw: string): string {
  const p = parseChannelName(raw);
  return [p.floor, p.name].filter(Boolean).join("-") || (raw || "");
}

/** 修正名：括号英文 + 楼层前移 + 房间号归一 + 补分隔符。只重排，不丢字节。 */
export function normalizeChannelName(raw: string): string {
  const p = parseChannelName(raw);
  return [p.floor, p.name, p.code].filter(Boolean).join("-") || raw;
}
