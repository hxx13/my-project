/** 从 roomName 提取父房间 key（例：201A → 201；210A → 210） */
function extractParentRoomKey(roomName) {
  var rn = roomName || '其他';
  var m = /^(\d+)/.exec(rn);
  return m ? m[1] : rn;
}

/** 校区 → 父房间 → 笼架组 → 笼架 四层结构（三层分组，笼架是叶子） */
function groupShelvesByCampus(shelves) {
  var campusMap = {};
  var campusOrder = [];
  (shelves || []).forEach(function(s) {
    var cn = s.campusName || "其他";
    var rn = s.roomName || "其他";
    var pr = extractParentRoomKey(rn);   // 父房间：201A → 201
    if (!campusMap[cn]) {
      campusMap[cn] = { campusName: cn, rooms: [], roomMap: {} };
      campusOrder.push(cn);
    }
    var cm = campusMap[cn];
    if (!cm.roomMap[pr]) {
      var room = { roomName: pr, shelfGroups: [], groupMap: {}, hasHighlight: false };
      cm.roomMap[pr] = room;
      cm.rooms.push(room);
    }
    var rm = cm.roomMap[pr];
    if (!rm.groupMap[rn]) {
      var sg = { key: rn, name: rn, shelves: [], hasHighlight: false, expanded: false,
                 c1: 0, c2: 0, c3: 0, c4: 0 };
      rm.groupMap[rn] = sg;
      rm.shelfGroups.push(sg);
    }
    rm.groupMap[rn].shelves.push(s);
    if (s.highlight) {
      rm.hasHighlight = true;
      rm.groupMap[rn].hasHighlight = true;
    }
  });
  // 索引只在构造期用，返回前清掉，避免调用方 setData 时把整棵树重复序列化
  campusOrder.forEach(function(k) {
    var cm = campusMap[k];
    delete cm.roomMap;
    cm.rooms.forEach(function(rm) {
      delete rm.groupMap;
    });
  });
  return campusOrder.map(function(k) { return campusMap[k]; });
}

module.exports = { extractParentRoomKey, groupShelvesByCampus };
