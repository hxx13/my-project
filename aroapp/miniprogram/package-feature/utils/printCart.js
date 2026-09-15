/**
 * 「待打清单」的纯逻辑一半：攒条目、改单条覆盖、持久化。
 * 与 Web 版 frontend/src/features/print-station/printCart.ts 逐条对齐，只换成 CommonJS +
 * 注入式存储（生产传包了 wx.setStorageSync/getStorageSync 的适配器，测试传内存假对象），
 * 所以这个模块不 require 任何东西、也不直接碰 wx。
 *
 * 持久化只存 templateItems 和 overrides：
 * localFiles 里是 File 对象，存不进 storage，而且提前传服务端会掉进 30 分钟的清理器。
 */

const STORAGE_KEY = 'print-station:cart';

/**
 * 模板库项的 key。它没有独立的 key 字段，是现算的：
 * 对模板库项调用方传进来的 key 就是 `"ADMIN_FILE:xxx"`。
 */
function templateKeyOf(item) {
  return `${item.sourceType}:${item.sourceId}`;
}

/** 会话内自增，保证同一个文件被选两次也拿到两个 key。 */
let localSeq = 0;

const empty = () => ({ templateItems: [], localFiles: [], overrides: {} });

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const isPrintItem = (v) =>
  isObject(v) &&
  typeof v.sourceType === 'string' &&
  typeof v.sourceId === 'string' &&
  typeof v.fileName === 'string';

/** 脏数据一律降级成空清单，不返回半死不活的状态。 */
function load(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return empty();
  }
  // wx.getStorageSync 在 key 不存在时返回 ''，localStorage 返回 null —— 两者都当没存储
  if (!raw) return empty();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return empty();
  }

  if (!isObject(parsed)) return empty();
  const { templateItems, overrides } = parsed;
  if (!Array.isArray(templateItems)) return empty();
  if (!isObject(overrides)) return empty();

  return {
    templateItems: templateItems.filter(isPrintItem),
    localFiles: [],
    overrides,
  };
}

function createCart(storage) {
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

module.exports = { createCart, templateKeyOf };
