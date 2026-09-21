'use strict';
/**
 * 批量转移（跨房间缓冲抽屉）的纯逻辑 —— 与 H5 `frontend/src/pages/mobile/batchTransferLogic.ts`
 * 是**同一份算法**，改一边必须同步另一边（与 animalOrderCagePicker.js ↔ web 的 cageAllocation 同款约束）。
 *
 * 配对模型是「逐源配目标」：配对挂在源 id 上、与顺序解耦。PC 的「位置即配对」是另一套语义，别互相搬。
 * JS 侧 targets / pool 用普通对象 { id: value }，等价于 H5 的 Map<string,string> / Map<string,CageOpTarget>。
 */
var cellVisual = require('./cageCellVisual.js');

/** 目标池 → 房间/架两级列表，保持后端顺序（SQL 已按 校区/楼层/房间/架/坐标 排好，前端不再排序） */
function groupPoolByRoom(pool) {
  var out = [];
  var byKey = {};
  (pool || []).forEach(function (t) {
    if (!t) return;
    var roomName = t.roomName || '其他';
    var campusName = t.campusName || '';
    var roomKey = campusName + '/' + roomName;
    var room = byKey[roomKey];
    if (!room) {
      room = { roomKey: roomKey, roomName: roomName, campusName: campusName, shelves: [] };
      byKey[roomKey] = room;
      out.push(room);
    }
    var shelveId = t.shelveId == null ? '' : String(t.shelveId);
    if (shelveId) {
      var dup = false;
      for (var i = 0; i < room.shelves.length; i++) {
        if (room.shelves[i].shelveId === shelveId) { dup = true; break; }
      }
      if (!dup) room.shelves.push({ shelveId: shelveId, shelveName: t.shelveName || shelveId });
    }
  });
  return out;
}

/** 池 → animalCageId 索引（普通对象），供网格逐格标 selectable / reason */
function indexPool(pool) {
  var m = {};
  (pool || []).forEach(function (t) {
    if (t && t.animalCageId != null) m[String(t.animalCageId)] = t;
  });
  return m;
}

/**
 * 从 from 起找下一个还没配目标的源下标（绕回开头），全配完 -1；from 越界取模兜住。
 * targets 是 { sourceId: targetId }，truthy 即已配。
 */
function nextUnpairedIdx(sources, targets, from) {
  var n = (sources || []).length;
  if (n === 0) return -1;
  var t = targets || {};
  var start = ((from % n) + n) % n;
  for (var k = 0; k < n; k++) {
    var i = (start + k) % n;
    if (!t[sources[i].animalCageId]) return i;
  }
  return -1;
}

/** 移出一个源：连带删它的目标，返回新对象，不改入参 */
function removeSource(sources, targets, sourceId) {
  var nextTargets = Object.assign({}, targets || {});
  delete nextTargets[sourceId];
  return {
    sources: (sources || []).filter(function (s) { return s.animalCageId !== sourceId; }),
    targets: nextTargets
  };
}

/**
 * 配对条文案：`F-4 → C-6` / `F-4 → 待选`。
 * 目标坐标走池条目自己的 positionX/Y；池里查不到这个 id 时不伪造坐标，退回「待选」。
 */
function pairRows(sources, targets, poolByCageId) {
  return (sources || []).map(function (s) {
    var tid = (targets || {})[s.animalCageId];
    var t = tid ? (poolByCageId || {})[tid] : null;
    var label = '';
    if (t && t.positionX != null && t.positionY != null) {
      label = displayLabelOf(t.positionX, t.positionY);
    }
    return { sourceId: s.animalCageId, text: s.label + ' → ' + (label || '待选'), paired: !!label };
  });
}

/**
 * 池坐标 → **与网格上看到的完全同一个**显示坐标。
 *
 * 必须走 enrichGridCell（网格渲染 `_displayPosition` 用的就是它那一段顶↔底翻转），
 * 不要用 `toPositionLabel` —— 那个不做翻转，同一条池坐标会比网格上的位号少翻转一次，
 * 用户会看到「格子上写 C-6、配对条写 C-5」两个坐标指同一个笼位。
 * （H5 侧 `displayPosition` 自带翻转，所以那边一条就够；两边最终文案必须一致。）
 */
function displayLabelOf(x, y) {
  return cellVisual.enrichGridCell({ x: x, y: y, position: x + '-' + y })._displayPosition;
}

module.exports = {
  groupPoolByRoom: groupPoolByRoom,
  indexPool: indexPool,
  nextUnpairedIdx: nextUnpairedIdx,
  removeSource: removeSource,
  pairRows: pairRows,
  displayLabelOf: displayLabelOf
};
