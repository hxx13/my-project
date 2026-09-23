/**
 * 迷你开关。
 * 原生 <switch> 是 52×32px 的大家伙，塞进紧凑列表/抽屉里又大又糙（用户 2026-09-23 要求禁用）。
 * 换成 60×34rpx（≈30×17px）的自绘开关：轨道 + 圆点，点击整块切换。
 */
Component({
  properties: {
    checked: { type: Boolean, value: false },
    /** 可选：关/开 的语义文案（不传则不显示） */
    label: { type: String, value: '' },
  },

  methods: {
    onTap() {
      this.triggerEvent('change', { value: !this.data.checked });
    },
  },
});
