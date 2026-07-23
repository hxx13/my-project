import { useCallback, useRef, useState } from "react";
import { postWinccWriteTag } from "@/api/telemetryApi";
import type { DtSceneWidget } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { firstCommandBindingSlot, parseBoolish } from "@/features/digital-twin-screen/layout/widgetSymbols/widgetBindingUtils";
import type { TelemetryTagItem } from "@/telemetry-view/types";

function nextToggleValue(currentRaw: string): 0 | 1 {
  const bl = parseBoolish(currentRaw);
  if (bl === true) return 0;
  if (bl === false) return 1;
  const n = Number(String(currentRaw).replace(",", "."));
  if (Number.isFinite(n)) return n !== 0 ? 0 : 1;
  return currentRaw.trim() === "" ? 1 : 0;
}

export function useDtWidgetWinccWrite(refreshNow: () => Promise<void>) {
  const [busyWidgetId, setBusyWidgetId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const executeWrite = useCallback(
    async (w: DtSceneWidget, valueByName: Map<string, TelemetryTagItem>) => {
      if (busyRef.current) return;
      const cmd = firstCommandBindingSlot(w);
      if (!cmd || !(cmd.variableName || "").trim()) {
        window.alert("未配置可写指令槽：请在详情中将某一绑定设为「指令」并填写变量名。");
        return;
      }
      const vn = cmd.variableName.trim();
      const tpl = w.commandWriteValueTemplate ?? "toggle01";
      let value: unknown;
      if (tpl === "literal") {
        const lit = w.commandWriteLiteral;
        if (lit === undefined || String(lit).trim() === "") {
          window.alert("写入模板为 literal 时请在详情中填写「literal 写入值」。");
          return;
        }
        value = lit;
      } else if (tpl === "momentaryPress") {
        value = 1;
      } else {
        const item = valueByName.get(vn);
        const raw = item?.value != null && item.value !== "" ? String(item.value).trim() : "0";
        value = nextToggleValue(raw);
      }
      busyRef.current = true;
      setBusyWidgetId(w.id);
      try {
        await postWinccWriteTag(vn, value);
        await refreshNow();
        if (tpl === "momentaryPress") {
          await new Promise((r) => setTimeout(r, 220));
          await postWinccWriteTag(vn, 0);
          await refreshNow();
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        busyRef.current = false;
        setBusyWidgetId(null);
      }
    },
    [refreshNow]
  );

  return { executeWrite, busyWidgetId };
}
