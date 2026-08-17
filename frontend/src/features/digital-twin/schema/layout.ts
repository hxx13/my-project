// 数字孪生 HVAC 拓扑的网格布局纯函数：把节点按泳道（lane）排成多行。

import type { TwinNode } from "./types";

/** 每行第一个节点的 x 坐标。 */
const COL_X_START = 120;
/** 同一行内相邻节点的水平间距。 */
const COL_X_STEP = 180;
/** 第一行（第 0 个 lane）的 y 坐标。 */
const ROW_Y_START = 120;
/** 相邻两行（不同 lane）之间的垂直间距。 */
const ROW_Y_STEP = 200;

/**
 * 将节点按 lane 分组布局成网格。
 * - 组内按 x 升序排列，然后从 x=120 起以 180 为步长依次排布；
 * - 同一 lane 的节点 y 对齐为该 lane 对应的行 y（第 i 个 lane = 120 + i*200）；
 * - 返回全新数组，不修改输入。
 */
export function gridLayout(nodes: TwinNode[], lanes: string[]): TwinNode[] {
  // 按 lane 分组，保持每个 lane 的原始节点顺序。
  const groups = new Map<string, TwinNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.lane);
    if (group) {
      group.push(node);
    } else {
      groups.set(node.lane, [node]);
    }
  }

  const result: TwinNode[] = [];

  const placeRow = (group: TwinNode[], y: number): void => {
    const sorted = [...group].sort((a, b) => a.x - b.x);
    sorted.forEach((node, index) => {
      result.push({ ...node, x: COL_X_START + index * COL_X_STEP, y });
    });
  };

  // 按 lanes 给定的顺序排每一行；未出现在 lanes 中的 lane 追加到末尾。
  const knownLanes = new Set(lanes);
  lanes.forEach((lane, index) => {
    const group = groups.get(lane);
    if (group) {
      placeRow(group, ROW_Y_START + index * ROW_Y_STEP);
    }
  });

  let extraRowIndex = lanes.length;
  for (const [lane, group] of groups) {
    if (knownLanes.has(lane)) {
      continue;
    }
    placeRow(group, ROW_Y_START + extraRowIndex * ROW_Y_STEP);
    extraRowIndex += 1;
  }

  return result;
}
