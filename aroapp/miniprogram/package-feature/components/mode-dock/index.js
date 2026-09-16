/**
 * 左下角「模式岛」—— 对齐 H5 `CageModeIsland` 的径向形态（radial）。
 *
 * H5 是右下角锚点、弧线 180°→270° 展开；挂左下角时把角度沿竖轴镜像（`-(ang-180)`，即 0°→-90°），
 * 展开方向就翻成往右上，不会铺到屏幕外。半径/容量算法与 H5 同一套（逐圈递增容量）。
 *
 * 模式项沿弧线 rotate + translateX 摆位，**内层反自转**保证文字始终正立（照 H5 的 .rt-anchor）。
 * 收起时所有项 translateX(0) 叠在圆钮下面且不接事件（照 H5 的 .rt-item pointer-events:none）。
 *
 * 纯展示组件：模式清单/可见范围/当前模式由宿主传入，点选只抛事件；
 * 再点当前模式会抛 `mode: 'view'`（与 H5 `pickMode` 同规则）。
 *
 * 用法：<mode-dock modes="{{ modeOptions }}" current="{{ pageMode }}" bind:change="onDockMode" />
 * 事件：change，detail = { mode }
 */

/* 两圈排布（≥5 项时）：内圈放前一半、外圈放其余，每圈各自在锚点右上那一个象限的弧上均分。
   半径不是拍脑袋定的 —— 按「同一圈相邻两颗不重叠」反推：弦长 = 2r·sin(角步长/2) ≥ 颗距，
   于是 r = 颗距 ÷ (2·sin(角步长/2))。颗距 = 72rpx 圆钮 + 12rpx 间隙（圆钮尺寸与 H5 的 36px 对齐）。
   外圈再保证与内圈留出一颗的径向间隙。项少（<5）只用一圈，避免 2+1 那种孤零零的排布。 */
var ARC_START_DEG = 15;  // 弧的起点：从正右再往右下让 15°（屏幕底部还有余量）
var ARC_SPAN_DEG = 105;  // 15° → -90°，共 105°
var ITEM_RPX = 88;       // 单颗直径（44px：触控标准尺寸）
var GAP_RPX = 12;        // 同圈相邻间隙
var PITCH = ITEM_RPX + GAP_RPX;
var MIN_R = 150;         // 单圈/内圈半径下限（别贴着圆钮）
var TWO_RING_MIN = 5;

/** 该圈的最小不重叠半径 */
function ringRadius(count) {
  if (count <= 1) return MIN_R;
  var stepRad = (ARC_SPAN_DEG / (count - 1)) * Math.PI / 180;
  return Math.max(MIN_R, Math.ceil(PITCH / (2 * Math.sin(stepRad / 2))));
}

/** 第 i 项的角度与半径（同圈同半径，按该圈项数均分） */
function slotOf(i, n) {
  if (n < TWO_RING_MIN) {
    var step1 = n > 1 ? ARC_SPAN_DEG / (n - 1) : 0;
    return { ang: ARC_START_DEG - step1 * i, r: ringRadius(n) };
  }
  // 内圈少、外圈多：内圈只放 ceil(n/3)（9 项 = 3+6）。这样外圈半径更小 ——
  // 外圈能装的项目数越多，同样不重叠所需的半径反而越小，整体更紧凑。
  var innerCount = Math.max(2, Math.ceil(n / 3));
  var onInner = i < innerCount;
  var idx = onInner ? i : i - innerCount;
  var count = onInner ? innerCount : (n - innerCount);
  var step = count > 1 ? ARC_SPAN_DEG / (count - 1) : 0;
  var r = onInner
    ? ringRadius(innerCount)
    : Math.max(ringRadius(count), ringRadius(innerCount) + ITEM_RPX + GAP_RPX);
  return { ang: ARC_START_DEG - step * idx, r: r };
}

Component({
  properties: {
    /** [{ key, label, color }]，color 空串 = 不上色（查看模式） */
    modes: { type: Array, value: [] },
    current: { type: String, value: '' },
    /** 距底/左（rpx）：默认与右下角扫码 FAB 齐平 */
    bottom: { type: Number, value: 120 },
    left: { type: Number, value: 40 },
  },

  data: {
    open: false,
    items: [],          // [{ key, label, color, ang, r }]
    currentKey: '',
    currentLabel: '模式',
    currentColor: '',
  },

  observers: {
    'modes, current': function (modes, current) {
      var list = modes || [];
      var items = list.map(function (m, i) {
        var slot = slotOf(i, list.length);
        return {
          key: m.key,
          label: m.label,
          color: m.color || '',
          ang: Math.round(slot.ang * 100) / 100,
          r: slot.r,
        };
      });
      var hit = list.filter(function (m) { return m && m.key === current; })[0];
      this.setData({
        items: items,
        currentKey: hit ? hit.key : '',
        currentLabel: (hit && hit.label) || '模式',
        currentColor: (hit && hit.color) || '',
      });
    },
  },

  methods: {
    onToggle() { this.setData({ open: !this.data.open }); },
    onPick(e) {
      var mode = e.currentTarget.dataset.mode;
      if (!mode) return;
      this.setData({ open: false });
      this.triggerEvent('change', { mode: mode === this.data.current ? 'view' : mode });
    },
  },
});
