/** 数字孪生场景编辑：图层标识（命中栈与图层栏共用） */
export type EditorLayerId = "rooms" | "ducts" | "widgets" | "ac";

export const ALL_EDITOR_LAYER_IDS: readonly EditorLayerId[] = ["rooms", "ducts", "widgets", "ac"] as const;
