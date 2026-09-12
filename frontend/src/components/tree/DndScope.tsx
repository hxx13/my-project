/**
 * DndScope —— 页面级的 dnd-kit 外壳，把传感器配置和 id 解析收在一处。
 *
 * 为什么不用原生 HTML5 拖拽：`draggable` + `DataTransfer` 在触摸端浏览器上
 * 根本不产生 dragstart/drop（桌面专属 API），平板/手机上拖拽会静默失效。
 * dnd-kit 走指针事件，鼠标和触摸同一套。
 *
 * 两种传感器各管一摊：
 *   - 鼠标：移动 6px 起拖，点击不受影响。
 *   - 触摸：长按 200ms 起拖。**不能用「移动即拖」**——树和画布都是可滚动的，
 *     那样会把滑动手势抢走，手指就没法滚列表了。
 */

import { useSensors, useSensor, MouseSensor, TouchSensor, DndContext, DragOverlay, useDroppable, type DragEndEvent, type DragStartEvent, type Modifier } from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { parseDndId, type DndKind } from "./dndIds";

export type DndRef = { kind: DndKind; id: string };

/**
 * 把跟手浮层锚到**指针中心**上。
 *
 * dnd-kit 的默认行为是：浮层 top/left = 被拖元素的左上角，再用 transform 补指针位移。
 * 于是你抓大卡片的中间时，标签会离光标差着一整个抓取偏移，看着就像「从卡片左上角冒出来」。
 * 这里把抓取点那段偏移减掉、再减去浮层自身一半的宽高，标签就正好压在指针上。
 */
const cursorAnchored: Modifier = ({ transform, activatorEvent, draggingNodeRect, overlayNodeRect }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const ev = activatorEvent as MouseEvent & TouchEvent;
  const point = ev.touches?.[0] ?? ev;
  if (point?.clientX == null) return transform;
  const grabX = point.clientX - draggingNodeRect.left;
  const grabY = point.clientY - draggingNodeRect.top;
  const dx = overlayNodeRect ? -overlayNodeRect.width / 2 : 0;
  const dy = overlayNodeRect ? -overlayNodeRect.height / 2 : 0;
  return { ...transform, x: transform.x + grabX + dx, y: transform.y + grabY + dy };
};

/**
 * 落点薄壳：铺满父容器的绝对定位层，只负责接掉落 + 画落点高亮。
 *
 * 为什么不让卡片自己 useDroppable：卡片是**递归**的，isOver 一翻转就重渲染整棵子树
 * （子卡片、里面每个物品格都跟着重算），鼠标每经过一张卡就卡一下。
 * 把落点挪到这一层后，翻转只重渲染这一枚 div；卡片的 children 引用没变，React 直接跳过。
 */
export function DropHalo({
  id,
  radiusClass = "rounded-twin-lg",
  disabled = false,
}: {
  id: string;
  /** 跟父容器圆角对齐，不然高亮ring 会在圆角处露出来 */
  radiusClass?: string;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0",
        radiusClass,
        isOver && "ring-2 ring-inset ring-[var(--twin-primary)]"
      )}
    />
  );
}

export function DndScope({
  onDrop,
  children,
}: {
  /** active 被拖的东西，over 落点；两者都解析过，解析不出来的 id 不会走到这里 */
  onDrop: (active: DndRef, over: DndRef) => void;
  children: ReactNode;
}) {
  /** 跟着手指/鼠标走的那一枚：由拖源在 data.preview 里给，不写就只高亮落点、没有跟手的预览 */
  const [preview, setPreview] = useState<ReactNode>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = (e: DragStartEvent) => {
    setPreview((e.active.data.current?.preview as ReactNode) ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setPreview(null);
    if (!e.over) return;
    const active = parseDndId(e.active.id);
    const over = parseDndId(e.over.id);
    if (!active || !over) return;
    if (active.kind === over.kind && active.id === over.id) return; // 落回自己
    onDrop(active, over);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setPreview(null)}
    >
      {children}
      {/* dropAnimation 关掉：默认的「飞回落点」动画在我的用法下收不了尾，
          会在屏幕上留一枚 opacity:1 / pointer-events:auto 的幽灵浮层，还会吃掉点击 */}
      <DragOverlay dropAnimation={null} modifiers={[cursorAnchored]}>{preview}</DragOverlay>
    </DndContext>
  );
}
