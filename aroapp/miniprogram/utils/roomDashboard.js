/** 与后端 TwinAuditService.floorPrefix 对齐：有连字符取首段；否则提取 B?F；否则「其它」 */
function floorPrefix(roomName) {
  const raw = roomName == null ? '' : String(roomName).trim();
  if (!raw) return 'UNKNOWN';
  const idx = raw.indexOf('-');
  if (idx >= 0) {
    const first = raw.slice(0, idx).trim();
    if (first) return first;
  }
  const m = raw.match(/B\d+F|\d+F/i);
  if (m) return m[0].toUpperCase();
  return '其它';
}

function floorSortKey(prefix) {
  const p = prefix == null ? '' : String(prefix).trim().toUpperCase();
  const g = p.match(/^(\d+)F$/);
  if (g) return Number(g[1]);
  const b = p.match(/^B(\d+)F$/);
  if (b) return -Number(b[1]);
  return -9999;
}

function sortFloorNamesDesc(a, b) {
  const sa = floorSortKey(a);
  const sb = floorSortKey(b);
  if (sa !== sb) return sb - sa;
  return String(a).localeCompare(String(b), 'zh-CN');
}

function normalizeRoom(room) {
  const r = room && typeof room === 'object' ? room : {};
  const totalCapacity = Number(r.totalCapacity || 0);
  const remainingCards = Number(r.remainingCards || 0);
  const campusUserCount = Number(r.campusUserCount || 0);
  const borrowedCardCount = Number(r.borrowedCardCount || 0);
  const followingCount = Number(r.followingCount || 0);
  return {
    ...r,
    roomId: r.roomId,
    campus: r.campus ? String(r.campus) : '未知校区',
    roomName: r.roomName ? String(r.roomName) : '未知房间',
    totalCapacity,
    remainingCards,
    campusUserCount,
    borrowedCardCount,
    followingCount,
    occupants: Array.isArray(r.occupants) ? r.occupants : [],
    floor: floorPrefix(r.roomName),
  };
}

function roomPersonCount(room) {
  const occ = Array.isArray(room.occupants) ? room.occupants.length : 0;
  if (occ > 0) return occ;
  const total = Math.max(0, Number(room.totalCapacity || 0));
  const remaining = Math.max(0, Number(room.remainingCards || 0));
  return Math.max(0, total - remaining);
}

function buildCampusFloorTree(rooms) {
  const list = Array.isArray(rooms) ? rooms.map(normalizeRoom) : [];
  const campusMap = {};

  list.forEach((room) => {
    const campus = room.campus || '未知校区';
    if (!campusMap[campus]) {
      campusMap[campus] = {};
    }
    const floor = room.floor;
    if (!campusMap[campus][floor]) {
      campusMap[campus][floor] = [];
    }
    campusMap[campus][floor].push(room);
  });

  return Object.keys(campusMap)
    .sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))
    .map((campus) => {
      const floorMap = campusMap[campus];
      const floors = Object.keys(floorMap)
        .sort(sortFloorNamesDesc)
        .map((floor) => {
          const rooms = floorMap[floor].slice().sort((x, y) => String(x.roomName).localeCompare(String(y.roomName), 'zh-CN'));
          return {
            floor,
            rooms,
            floorPersonCount: rooms.reduce((sum, room) => sum + roomPersonCount(room), 0),
          };
        });
      return {
        campus,
        floors,
      };
    });
}

function pickRoomsByCampusFloor(rooms, campus, floor) {
  const list = Array.isArray(rooms) ? rooms.map(normalizeRoom) : [];
  return list
    .filter((r) => r.campus === campus && r.floor === floor)
    .sort((a, b) => String(a.roomName).localeCompare(String(b.roomName), 'zh-CN'));
}

/** 与房间页左侧一致：固定「浦东」「浦西」顺序，其余校区按树中顺序接在后面 */
function buildCampusDisplayList(campusTree, expandedMap) {
  const fixed = ['浦东', '浦西'];
  const others = campusTree.map((item) => item.campus).filter((c) => !fixed.includes(c));
  const allCampuses = fixed.concat(others);
  return allCampuses.map((campus) => {
    const node = campusTree.find((i) => i.campus === campus) || { campus, floors: [] };
    return {
      campus,
      expanded: !!expandedMap[campus],
      floors: node.floors || [],
    };
  });
}

/** 审核页专用：一级仅「浦东」「浦西」两栏 */
function buildAuditCampusDisplayList(campusTree, expandedMap) {
  const fixed = ['浦东', '浦西'];
  return fixed.map((campus) => {
    const node = campusTree.find((i) => i.campus === campus) || { campus, floors: [] };
    return {
      campus,
      expanded: !!expandedMap[campus],
      floors: node.floors || [],
    };
  });
}

/** 与房间页左侧楼层角标一致：某校区各楼层 floorPersonCount 之和 */
function sumFloorPersonCountForCampus(campusTree, campusName) {
  const name = campusName == null ? '' : String(campusName).trim();
  if (!name || !Array.isArray(campusTree)) return 0;
  const node = campusTree.find((x) => x && String(x.campus || '').trim() === name);
  if (!node || !Array.isArray(node.floors)) return 0;
  return node.floors.reduce((s, f) => s + Math.max(0, Number(f.floorPersonCount || 0)), 0);
}

module.exports = {
  floorPrefix,
  floorSortKey,
  normalizeRoom,
  roomPersonCount,
  buildCampusFloorTree,
  buildCampusDisplayList,
  buildAuditCampusDisplayList,
  pickRoomsByCampusFloor,
  sumFloorPersonCountForCampus,
};
