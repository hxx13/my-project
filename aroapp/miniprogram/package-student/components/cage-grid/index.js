/**
 * 通用 80 格笼位网格。
 *
 * 只做一件事：把 cageCellVisual.buildGrid() 出来的格子按标准样式画出来（位号 / 课题人 /
 * 实验员 / 类型灯 / 特殊饲养角标 / 空位 / 受限），并把点击事件抛给宿主页面。
 *
 * 为什么要有它：卡牌打印、动物订购、笼架页都要画这套网格，各自抄一份必然漂移。
 * 选中态与可点性由宿主决定 —— 宿主往格子上写 `_sel` / `_dis` / `_qty` 三个标记，
 * 组件只负责画（不碰业务：不请求、不判断能不能选）。
 *
 * 用法：
 *   <cage-grid grid="{{ grid }}" bind:celltap="onCellTap" />
 *   <cage-grid grid="{{ sh.grid }}" compact data-sid="{{ sh.shelveId }}" bind:celltap="onCellTap" />
 * 事件：celltap detail = { index }；宿主可用 currentTarget.dataset 带自己的上下文。
 */
Component({
  properties: {
    /** cageCellVisual.buildGrid() 的结果（已补满 80 格） */
    grid: { type: Array, value: [] },
    /** 紧凑档：字号缩一档，供抽屉/弹层里用 */
    compact: { type: Boolean, value: false },
    /** 教职工视角：划分名单显示「已划分：张三、李四」，否则只给本人命中时显示「已划分给你」 */
    staffView: { type: Boolean, value: false },
  },

  methods: {
    onCellTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (isNaN(index)) return;
      this.triggerEvent('celltap', { index: index });
    },
  },
});
