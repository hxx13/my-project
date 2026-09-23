'use strict';

/**
 * 卡牌打印：选格集合纯模块。
 *
 * 只做状态，不碰 wx、不碰页面。内部结构 Map<shelveId, Map<cellId, {id,x,y}>>，
 * Map 保留插入顺序，所以 ids()/list() 天然是「加入顺序」，signature() 再排序去顺序敏感。
 *
 * 关键口径：
 * - 跨笼架选择（count() 合计 / countOnShelf() 本架）
 * - 同 id 不同架互不影响（按架分命名空间）
 * - 空位（无 id）无效
 * - 雪花 id 全程当字符串
 */

/** 取 cell 的 id 字符串；无 id / 空串 / cell 为 null 返回 ''。 */
function idOf(cell) {
  if (!cell || cell.id === undefined || cell.id === null) return '';
  return String(cell.id);
}

function createSelection() {
  /** @type {Map<string, Map<string, {id: string, x: *, y: *}>>} */
  var shelves = new Map();

  function shelfOf(shelveId, create) {
    var key = String(shelveId);
    var m = shelves.get(key);
    if (!m && create) {
      m = new Map();
      shelves.set(key, m);
    }
    return m;
  }

  /** 把 cell 归一成只带 {id,x,y} 的快照，避免外部对象后续被改写。 */
  function snapshot(cell, id) {
    return { id: id, x: cell.x, y: cell.y };
  }

  return {
    /** 点格子：已选则取消，未选则追加。空位/非法 cell 返回 false。 */
    toggle: function (shelveId, cell) {
      var id = idOf(cell);
      if (!id) return false;
      var m = shelfOf(shelveId, true);
      if (m.has(id)) {
        m.delete(id);
      } else {
        m.set(id, snapshot(cell, id));
      }
      return true;
    },

    isSelected: function (shelveId, cellId) {
      var key = cellId === undefined || cellId === null ? '' : String(cellId);
      if (!key) return false;
      var m = shelves.get(String(shelveId));
      return !!m && m.has(key);
    },

    /** 本架全选：补进尚未选中的格子，跳过空位；已选的不动（不取消）。 */
    selectAllOnShelf: function (shelveId, cells) {
      if (!Array.isArray(cells) || !cells.length) return;
      var m = null; // 惰性建架：全是空位时不留下 cells:[] 的幽灵分组
      for (var i = 0; i < cells.length; i++) {
        var id = idOf(cells[i]);
        if (!id) continue;
        if (!m) m = shelfOf(shelveId, true);
        if (m.has(id)) continue;
        m.set(id, snapshot(cells[i], id));
      }
    },

    /** 只清本架。 */
    clearShelf: function (shelveId) {
      shelves.delete(String(shelveId));
    },

    /** 清空全部，只由「已选清单」弹窗调。 */
    clearAll: function () {
      shelves.clear();
    },

    /** 跨架合计。 */
    count: function () {
      var n = 0;
      shelves.forEach(function (m) { n += m.size; });
      return n;
    },

    /** 本架已选数。 */
    countOnShelf: function (shelveId) {
      var m = shelves.get(String(shelveId));
      return m ? m.size : 0;
    },

    /** 按加入顺序的 animalCageId 字符串数组，直接进请求体。 */
    ids: function () {
      var out = [];
      shelves.forEach(function (m) {
        m.forEach(function (c) { out.push(c.id); });
      });
      return out;
    },

    /** 已选清单弹窗：[{shelveId, cells: [{id,x,y}]}]，按加入顺序分组。 */
    list: function () {
      var out = [];
      shelves.forEach(function (m, shelveId) {
        var cells = [];
        m.forEach(function (c) { cells.push({ id: c.id, x: c.x, y: c.y }); });
        out.push({ shelveId: shelveId, cells: cells });
      });
      return out;
    },

    /**
     * 稳定签名：与加入顺序无关，选择一变签名就变。
     * 带架名命名空间——否则 S1:['1'] + S2:['2'] 与 S1:['1','2'] 会撞成同一个签名，
     * 页面就会拿着旧 archiveId 去打印另一组格子。
     */
    signature: function () {
      var keys = [];
      shelves.forEach(function (m, shelveId) {
        m.forEach(function (c) { keys.push(shelveId + ':' + c.id); });
      });
      keys.sort();
      return keys.join(',');
    },
  };
}

module.exports = { createSelection: createSelection };
