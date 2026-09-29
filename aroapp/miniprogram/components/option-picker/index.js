/**
 * option-picker — 通用单选选择器：触发器（当前值 + ▾）+ 底部弹出列表。
 *
 * 为什么不用原生 <picker>：原生是滚轮选择器，手机上不好点也不好读，且样式没法做（用户明确禁用）。
 * 与本项目既有的 location-tree-picker / staff-reviewer-picker 同一种交互：
 * 触发器留在表单里，点开是底部面板列表，当前项打勾。
 *
 * 用法：
 *   <option-picker placeholder="请选择" options="{{ opts }}" value="{{ v }}" bindchange="onChange" />
 *   options: [{ value, label, desc? }]；change 回传 { value, index }
 *
 * searchable：选项多（课题组 70+、物品几十个）时打开面板顶部的搜索框，按 label/desc 过滤；
 *   默认关闭，老调用方行为不变。打开时清空上次关键词，避免"点开只剩上次的搜索结果"。
 */
Component({
  properties: {
    /** [{ value, label, desc? }] */
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
    /** 底部面板标题 */
    title: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    searchable: { type: Boolean, value: false },
  },

  data: {
    open: false,
    currentLabel: '',
    keyword: '',
    /** 过滤后的可见选项（searchable=false 时恒等于 options） */
    view: [],
  },

  observers: {
    'options, value': function (options, value) {
      const hit = (options || []).find((o) => o.value === value);
      this.setData({ currentLabel: hit ? hit.label : '' });
      this.applyFilter();
    },
    keyword: function () {
      this.applyFilter();
    },
  },

  methods: {
    applyFilter() {
      const list = this.data.options || [];
      const k = String(this.data.keyword || '').trim().toLowerCase();
      if (!k) {
        this.setData({ view: list });
        return;
      }
      this.setData({
        view: list.filter((o) => {
          const label = String((o && o.label) || '').toLowerCase();
          const desc = String((o && o.desc) || '').toLowerCase();
          return label.indexOf(k) >= 0 || desc.indexOf(k) >= 0;
        }),
      });
    },

    onKeywordInput(e) {
      this.setData({ keyword: (e.detail && e.detail.value) || '' });
    },

    onOpen() {
      if (this.data.disabled) return;
      // 每次打开都从干净的关键词开始（保留关键词会让"想选另一个"时看到空列表）
      this.setData({ open: true, keyword: '' }, () => this.applyFilter());
    },

    onClose() {
      this.setData({ open: false });
    },

    onPick(e) {
      const i = Number(e.currentTarget.dataset.i);
      const opt = (this.data.view || [])[i];
      if (!opt) return;
      this.setData({ open: false });
      if (opt.value === this.data.value) return;
      const index = (this.data.options || []).findIndex((o) => o && o.value === opt.value);
      this.triggerEvent('change', { value: opt.value, index: index < 0 ? i : index });
    },
  },
});
