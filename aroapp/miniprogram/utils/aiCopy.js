/**
 * 小程序端「AI 抽屉文案」取值器 —— 与 web 端 `scan-assistant/aiDrawerCopy.ts` 同一套口径。
 *
 * <p>界面固定文案的「键 → 值」由后端配置（权威清单是后端 `AiDrawerCopySeed`），取不到
 * （没登录 / 超时 / 接口挂了）就回落**调用点的兜底原文** —— 与改动前逐字相同，绝不白屏。
 *
 * <p>通用件，多处调用点共用：
 *   - `copy(key, fallback, vars?)`  取值（同步，读缓存；首次调用顺手拉一次）
 *   - `loadCopy()`                  拉一次并缓存；失败**不缓存**，下次还能再试
 *   - `applyCopyVars(t, vars)`      **纯函数**：替换 `{name}` / `{mm:ss}` 占位符
 *   - `resolveCopy(map, key, fb, vars)` **纯函数**：从一份 map 里取值（便于单测）
 */
const springAuth = require('./springAuth.js');

/** 与卡片内容同一个接口，copy 与 capabilities 一份返回。 */
const COPY_URL = '/api/v1/ai/drawer/content';
/** 超时：超了就当拿不到，静默回落兜底。 */
const COPY_TIMEOUT_MS = 4000;

/** 进程内缓存：一次小程序生命周期只拉一次，多处调用点共用。 */
let cache = null;
let inflight = null;

/**
 * 占位符替换（**纯函数**）。把模板里的 `{name}` / `{mm:ss}` 换成变量值；
 * **没给对应变量的占位符原样留着** —— 库里配了模板却没给值时，漏配一眼可见。
 */
function applyCopyVars(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{([^{}]+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

/**
 * 取一条文案（**纯函数**）：map 里有该键的**非空**值就以它为准（过一遍占位符替换），
 * 否则返回兜底原文（原样返回，不再替换 —— 它本来就是拼好的成品）。
 */
function resolveCopy(map, key, fallback, vars) {
  const fromDb = map ? map[key] : null;
  if (typeof fromDb === 'string' && fromDb.length > 0) {
    return applyCopyVars(fromDb, vars);
  }
  return fallback;
}

/**
 * 拉一次并缓存。失败 / 超时静默回落空表（调用点各自用兜底原文）。
 * 成功才写缓存；失败不写，于是下一次调用还能再试一次。
 */
function loadCopy() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      inflight = null;
      resolve(value);
    };
    const timer = setTimeout(() => finish(cache || {}), COPY_TIMEOUT_MS);
    springAuth
      .springRequest({ url: COPY_URL, method: 'GET', data: {} })
      .then((res) => {
        try {
          const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          const map = body && body.success && body.data && body.data.copy;
          if (map && typeof map === 'object') cache = map; // 成功才缓存
        } catch (e) {
          /* 解析失败按「拿不到」处理 */
        }
        finish(cache || {});
      })
      .catch(() => finish(cache || {})); // 失败不写缓存
  });
  return inflight;
}

/** 同步取值。首次调用（缓存还空）顺手拉一次，本次先用兜底，等它回来下载下一次就准了。 */
function copy(key, fallback, vars) {
  if (!cache) loadCopy();
  return resolveCopy(cache, key, fallback, vars);
}

/** 推荐指令条接口。与卡片内容同源，但**排序口径不同**（个人热榜 vs 全量分组），所以另开一面。 */
const RECOMMENDED_URL = '/api/v1/ai/drawer/recommended';

/**
 * 取推荐指令条（输入框上方那一排）。
 *
 * 服务端已按「个人频次 → 全站热度 → 原排序」排好，**前端不重排** ——
 * 两端各排一次迟早会出现 web 一个样、小程序一个样。
 *
 * **不缓存**：它是按人的，换账号要重取；一次进出抽屉取一次足够。
 * 失败一律返回空数组：指令条整条不显示，绝不影响对话。
 */
function loadRecommended() {
  return springAuth
    .springRequest({ url: RECOMMENDED_URL, method: 'GET', data: {} })
    .then((res) => {
      try {
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const list = body && body.success && body.data;
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    })
    .catch(() => []);
}

module.exports = { copy, loadCopy, loadRecommended, applyCopyVars, resolveCopy, URL: COPY_URL };
