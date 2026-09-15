/**
 * 「待打清单」的纯逻辑一半：攒条目、改单条覆盖、持久化。
 * 与 React 无关，storage 由调用方注入（生产传 window.localStorage），
 * 所以能在 node 环境的 vitest 里真跑。
 *
 * 持久化只存 templateItems 和 overrides：
 * localFiles 里是 File 对象，存不进 storage，而且提前传服务端会掉进 30 分钟的清理器。
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 模板库文件的引用 */
export interface PrintItem {
  sourceType: string;
  sourceId: string;
  fileName: string;
}

/** 临时打印的本地文件（会话内有效） */
export interface LocalFileItem {
  key: string;
  file: File;
  name: string;
}

export interface CartOverride {
  copies?: number;
  urgent?: boolean;
}

export interface CartState {
  templateItems: PrintItem[];
  localFiles: LocalFileItem[];
  overrides: Record<string, CartOverride>;
}

export interface Cart {
  getState(): CartState;
  addTemplateItems(items: PrintItem[]): CartState;
  addLocalFiles(files: File[]): CartState;
  remove(key: string): CartState;
  setOverride(key: string, patch: CartOverride): CartState;
  clear(): CartState;
  count(): number;
}

const STORAGE_KEY = "print-station:cart";

/**
 * 模板库项的 key。它没有独立的 key 字段，是现算的：
 * 对模板库项调用方传进来的 key 就是 `"ADMIN_FILE:xxx"`。
 */
export function templateKeyOf(item: PrintItem): string {
  return `${item.sourceType}:${item.sourceId}`;
}

/** 会话内自增，保证同一个文件被选两次也拿到两个 key。 */
let localSeq = 0;

const empty = (): CartState => ({ templateItems: [], localFiles: [], overrides: {} });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isPrintItem = (v: unknown): v is PrintItem =>
  isObject(v) &&
  typeof v.sourceType === "string" &&
  typeof v.sourceId === "string" &&
  typeof v.fileName === "string";

/** 脏数据一律降级成空清单，不返回半死不活的状态。 */
function load(storage: StorageLike): CartState {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return empty();
  }
  if (!raw) return empty();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty();
  }

  if (!isObject(parsed)) return empty();
  const { templateItems, overrides } = parsed;
  if (!Array.isArray(templateItems)) return empty();
  if (!isObject(overrides)) return empty();

  return {
    templateItems: templateItems.filter(isPrintItem),
    localFiles: [],
    overrides: overrides as Record<string, CartOverride>,
  };
}

export function createCart(storage: StorageLike): Cart {
  let state = load(storage);

  const persist = () => {
    // 只写这两块，localFiles 永不落盘
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ templateItems: state.templateItems, overrides: state.overrides }),
    );
  };

  return {
    getState: () => state,

    addTemplateItems(items) {
      const seen = new Set(state.templateItems.map(templateKeyOf));
      const merged = [...state.templateItems];
      for (const item of items) {
        const key = templateKeyOf(item);
        if (seen.has(key)) continue; // 重复静默跳过
        seen.add(key);
        merged.push(item);
      }
      state = { ...state, templateItems: merged };
      persist();
      return state;
    },

    addLocalFiles(files) {
      const added = files.map((file) => {
        const key = `local:${++localSeq}`;
        return { key, file, name: file.name };
      });
      // 不去重：同一个文件选两次就是两条
      state = { ...state, localFiles: [...state.localFiles, ...added] };
      persist();
      return state;
    },

    remove(key) {
      // 覆盖跟着条目走，否则重新加入会带回用户没设过的值
      const overrides = { ...state.overrides };
      delete overrides[key];
      state = {
        ...state,
        templateItems: state.templateItems.filter((i) => templateKeyOf(i) !== key),
        localFiles: state.localFiles.filter((i) => i.key !== key),
        overrides,
      };
      persist();
      return state;
    },

    setOverride(key, patch) {
      state = {
        ...state,
        // 覆盖信息可以比条目先到，所以 key 不存在也照写
        overrides: { ...state.overrides, [key]: { ...state.overrides[key], ...patch } },
      };
      persist();
      return state;
    },

    clear() {
      state = empty();
      persist();
      return state;
    },

    count() {
      return state.templateItems.length + state.localFiles.length;
    },
  };
}
