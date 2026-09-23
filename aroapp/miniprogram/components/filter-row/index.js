/** 筛选抽屉里的一行：左标签 + 右侧可换行选项 chip。单选，选中回传 value。 */
Component({
  options: { multipleSlots: false },

  properties: {
    label: { type: String, value: '' },
    /** [{ value, label }] */
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
  },

  methods: {
    onPick(e) {
      const v = String(e.currentTarget.dataset.v || '');
      if (v === this.data.value) return;
      this.triggerEvent('change', { value: v });
    },
  },
});
