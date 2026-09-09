const assetApi = require('../../utils/assetApi.js');

/** 搜索过滤：命中节点保留整棵子树（可继续下钻），只有子孙命中的节点保留「命中链」 */
function filterKeepSubtrees(nodes, keyword) {
  const k = (keyword || '').trim().toLowerCase();
  if (!k) return nodes || [];
  const out = [];
  (nodes || []).forEach((n) => {
    if (String(n.name || '').toLowerCase().indexOf(k) >= 0) {
      out.push(n);
      return;
    }
    const kids = filterKeepSubtrees(n.children || [], keyword);
    if (kids.length) out.push(Object.assign({}, n, { children: kids }));
  });
  return out;
}

/**
 * location-tree-picker — 存放地点树选择器（分级 · 默认收起 · 可搜索）
 *
 * 与网页端 `AssetLocationTreeSelect` 同一套交互与取值口径：
 *   value 为地点「全路径文本」（与 EAV 存放地点列一致）
 *   change 事件同时回传 { path, nodeId }，转移类调用方直接拿 nodeId 调接口
 */
Component({
  properties: {
    value: { type: String, value: '' },
    placeholder: { type: String, value: '选择存放地点' },
    disabled: { type: Boolean, value: false },
  },

  data: {
    open: false,
    keyword: '',
    rows: [],
  },

  lifetimes: {
    attached() {
      this._tree = [];
      this._expanded = {};
      this.loadTree();
    },
  },

  methods: {
    noop() {},

    async loadTree() {
      try {
        this._tree = await assetApi.fetchAssetLocationTree();
      } catch (e) {
        this._tree = [];
      }
      this.rebuild();
    },

    /** 供父组件在新增/改名地点后主动刷新 */
    refresh() {
      this.loadTree();
    },

    /** 展平成带 depth 的行（WXML 不能递归，用缩进模拟层级） */
    rebuild() {
      const k = (this.data.keyword || '').trim().toLowerCase();
      const source = k ? filterKeepSubtrees(this._tree, k) : this._tree;
      const rows = [];
      const walk = (nodes, depth, prefix) => {
        (nodes || []).forEach((n) => {
          const path = prefix ? `${prefix} / ${n.name}` : n.name;
          const children = n.children || [];
          // 搜索态全部展开；平时按用户展开状态
          const open = k ? true : !!this._expanded[n.id];
          rows.push({
            id: n.id,
            name: n.name,
            icon: n.icon || '',
            depth,
            path,
            hasChildren: children.length > 0,
            open,
            selected: path === this.data.value,
          });
          if (open && children.length) walk(children, depth + 1, path);
        });
      };
      walk(source, 0, '');
      this.setData({ rows });
    },

    onToggleOpen() {
      if (this.data.disabled) return;
      const open = !this.data.open;
      this.setData({ open, keyword: open ? '' : this.data.keyword });
      if (open) this.rebuild();
    },

    close() {
      this.setData({ open: false });
    },

    onKeywordInput(e) {
      this.setData({ keyword: e.detail.value || '' });
      this.rebuild();
    },

    onClearKeyword() {
      this.setData({ keyword: '' });
      this.rebuild();
    },

    onToggleExpand(e) {
      const id = e.currentTarget.dataset.id;
      this._expanded[id] = !this._expanded[id];
      this.rebuild();
    },

    onPick(e) {
      const ds = e.currentTarget.dataset;
      this.triggerEvent('change', { path: ds.path, nodeId: Number(ds.id) });
      this.setData({ open: false });
    },
  },
});
