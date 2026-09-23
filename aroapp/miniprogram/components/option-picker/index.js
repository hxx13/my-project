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
  },

  data: {
    open: false,
    currentLabel: '',
  },

  observers: {
    'options, value': function (options, value) {
      const hit = (options || []).find((o) => o.value === value);
      this.setData({ currentLabel: hit ? hit.label : '' });
    },
  },

  methods: {
    onOpen() {
      if (this.data.disabled) return;
      this.setData({ open: true });
    },

    onClose() {
      this.setData({ open: false });
    },

    onPick(e) {
      const i = Number(e.currentTarget.dataset.i);
      const opt = (this.data.options || [])[i];
      if (!opt) return;
      this.setData({ open: false });
      if (opt.value === this.data.value) return;
      this.triggerEvent('change', { value: opt.value, index: i });
    },
  },
});
