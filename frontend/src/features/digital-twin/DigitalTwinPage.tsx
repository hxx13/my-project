// 数字孪生 HVAC 拓扑页面薄壳：组合编辑器组件 + localStorage 持久化。
// 本文件只负责布局、启动水合与防抖保存；编辑/渲染逻辑全部在下层模块。

import { useEffect } from "react";
import { DEFAULT_FLOORS } from "@/features/digital-twin/schema/defaults";
import type { TwinGraph } from "@/features/digital-twin/schema/types";
import { useDigitalTwinStore } from "@/features/digital-twin/editor/store";
import { NodePalette } from "@/features/digital-twin/editor/nodePalette";
import { Inspector } from "@/features/digital-twin/editor/inspector";
import { TwinCanvas } from "@/features/digital-twin/editor/TwinCanvas";
import { Toolbar } from "@/features/digital-twin/editor/toolbar";
import { LocalStorageAdapter } from "./storage/localStorage";

/** 防抖保存间隔（毫秒）。 */
const SAVE_DEBOUNCE_MS = 450;

export default function DigitalTwinPage() {
  const mode = useDigitalTwinStore((s) => s.mode);

  // 预留权限位：Phase C 接入权限体系后据此决定编辑能力是否可用。
  // 当前恒为 true，不强制 display 态，只保留一个语义清晰的入口。
  const canEdit = true;

  // 水合：启动时从 localStorage 载入各楼层已落盘拓扑并合并进 store，
  // 保留未落盘楼层的空图默认值；不推撤销栈、不清 activeFloor。
  useEffect(() => {
    const adapter = new LocalStorageAdapter();
    const loaded: Record<string, TwinGraph> = {};
    for (const floor of DEFAULT_FLOORS) {
      const graph = adapter.load(floor);
      if (graph) loaded[floor] = graph;
    }
    useDigitalTwinStore.setState({
      floors: { ...useDigitalTwinStore.getState().floors, ...loaded },
    });
  }, []);

  // 防抖保存：订阅任何状态变化，450ms 静默期后把当前活动楼层写入 localStorage。
  useEffect(() => {
    const adapter = new LocalStorageAdapter();
    let timer: number | undefined;
    const unsubscribe = useDigitalTwinStore.subscribe((s) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        adapter.save(s.activeFloor, s.floors[s.activeFloor]);
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const isEdit = mode === "edit" && canEdit;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <Toolbar />
      </div>
      <div className="flex min-h-0 flex-1">
        {isEdit && <NodePalette />}
        <div className="relative min-w-0 flex-1">
          <TwinCanvas />
        </div>
        {isEdit && <Inspector />}
      </div>
    </div>
  );
}
