/**
 * 大华通道命名规则（小程序版）：目标格式 `楼层-名称(房间号)-方位-常开/常闭-编号`。
 * 与 Web 端 frontend/src/utils/dahuaChannelName.ts 同一套口径，改动请两边同步。
 * 判定口径：括号内的数字是房号；括号外的数字、GY4F/GYB1F、SY/RD/MK/RL 段都归「编号」。
 */
var CODE_SEG = '(?:GY(?:B?\\d+F)|B?\\d+F|\\d+|SY|RD\\d+|MK\\d+|RL\\d+)';
var CODE_TAIL_ONLY = new RegExp('^' + CODE_SEG + '(?:-' + CODE_SEG + ')*_?$');
var NAME_FLOOR = /^(B?\d+F)(?![0-9F])/;
var TAIL_FLOOR = /^(B?\d+F)(?:-|$)/;
var VIDEO_CODE = /^(.*?JK\s*\d+(?:-\d+)?)\s*(.*)$/i;

function normalizeRoom(text) {
  return String(text || '')
    .replace(/-([A-Z])\((\d+)-([A-Z])\)/g, '($2$1)')
    .replace(/-([A-Z])\((\d+)\)/g, '($2$1)')
    .replace(/\((\d+)-([A-Z])\)/g, '($1$2)');
}

function inferFloorFromText(text) {
  var basement = String(text || '').match(/(?:^|[-\s(])B(\d)/i);
  if (basement) return 'B' + basement[1] + 'F';
  var room = String(text || '').match(/\(([^)]*)\)/);
  if (room) {
    var digits = room[1].match(/(\d{3,})/);
    if (digits) return digits[1][0] + 'F';
  }
  return '';
}

function parseChannelName(raw) {
  var n = String(raw || '').replace(/（/g, '(').replace(/）/g, ')');
  var vm = n.match(VIDEO_CODE);
  if (vm && vm[2].trim()) {
    var vcode = vm[1].replace(/\s+/g, '');
    var vrest = vm[2].trim();
    var vfloor = '';
    var leading = vrest.match(/^(B?\d+F)(?![0-9F])/);
    if (leading) {
      vfloor = leading[1];
      vrest = vrest.slice(vfloor.length).trim();
    } else if (/^F(?![0-9])/i.test(vrest) && /\d$/.test(vcode)) {
      vfloor = vcode.slice(-1) + 'F';
      vcode = vcode.slice(0, -1);
      vrest = vrest.slice(1).trim();
    }
    var vname = normalizeRoom(vrest);
    return { floor: vfloor || inferFloorFromText(vname), name: vname, code: vcode };
  }

  var tail = '';
  for (var i = 1; i < n.length; i += 1) {
    if (n[i - 1] !== '-' && n[i - 1] !== ')') continue;
    var cand = n.slice(i);
    if (CODE_TAIL_ONLY.test(cand)) {
      tail = cand;
      break;
    }
  }
  var head = tail ? n.slice(0, n.length - tail.length).replace(/[-_]+$/, '') : n;

  var floor = '';
  var nameFloor = head.match(NAME_FLOOR);
  if (nameFloor) {
    floor = nameFloor[1];
    head = head.slice(floor.length).replace(/^[-_\s]+/, '');
  }
  var code = tail.replace(/_+$/, '');
  if (!floor) {
    var tailFloor = code.match(TAIL_FLOOR);
    if (tailFloor) {
      floor = tailFloor[1];
      code = code.slice(floor.length).replace(/^-+/, '');
    }
  }
  if (!floor) {
    var gy = code.match(/^GY(B?\d+F)(?:-|$)/);
    if (gy) floor = gy[1];
  }
  if (!floor) floor = inferFloorFromText(head);
  // 房号能反推楼层时以房号为准
  var roomFloor = inferFloorFromText(head);
  if (roomFloor && roomFloor !== floor) floor = roomFloor;
  // 括号外的尾部数字属于编号
  var glued = head.match(/^(.*[^\d\s])(\d+)$/);
  if (glued) {
    head = glued[1];
    code = [glued[2], code].filter(Boolean).join('-');
  }
  return { floor: floor, name: normalizeRoom(head), code: code };
}

/** 列表展示用：楼层-名称（编号隐藏） */
function displayFloorAndName(raw) {
  var p = parseChannelName(raw);
  var text = [p.floor, p.name].filter(Boolean).join('-');
  return text || String(raw || '');
}

module.exports = {
  parseChannelName: parseChannelName,
  displayFloorAndName: displayFloorAndName,
};
