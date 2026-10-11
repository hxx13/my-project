/**
 * AI 对话抽屉「详情」二级抽屉的**写口**：保存文案、整份保存能力清单。**仅 ≥SUPER_ADMIN**。
 *
 * <p>全仓**只有本文件**直发这几个请求 —— 日后后端路径 / 字段若再变，只改这里，别处不写死路径。
 *
 * <p>落地契约（与后端 {@code AiDrawerController} 现网一致，非「再包一层」）：
 *   <ul>
 *     <li>管理端只读：{@code GET /api/v1/ai/drawer/admin/content}（仅 ≥超管），未按视角过滤的整份，
 *         文案带中文名、能力带 enabled / audience（含停用行）—— 编辑态「读整份 → 改 → 存整份」的取数口。</li>
 *     <li>保存文案：{@code POST /api/v1/ai/drawer/copy}，请求体是**扁平的** {@code {"键":"新值"}}；
 *         <b>空串 = 恢复默认</b>（后端写回 NULL，读取侧回落代码内置原文）。</li>
 *     <li>保存能力清单：{@code POST /api/v1/ai/drawer/capabilities}，请求体是**数组本身**
 *         {@code [{id,groupName,title,promptText,sortOrder,enabled}]}；<b>整份提交</b>，提交里没有的 id 即删除。</li>
 *   </ul>
 *
 * <p>失败**如实抛错**（拿不到 {@code success:true} 一律 reject），调用点据此提示、不改界面成「已保存」。
 */
const springAuth = require('./springAuth.js');
const roleAccess = require('./roleAccess.js');

const COPY_URL = '/api/v1/ai/drawer/copy';
const CAPABILITIES_URL = '/api/v1/ai/drawer/capabilities';
const ADMIN_CONTENT_URL = '/api/v1/ai/drawer/admin/content';

/** 当前登录人是否 ≥SUPER_ADMIN（口径复用 roleAccess.hasMinRole；读不到会话按「不是」处理）。 */
function isAdmin() {
  try {
    return roleAccess.hasMinRole(wx.getStorageSync(springAuth.KEYS.ROLE), 'SUPER_ADMIN');
  } catch (e) {
    return false;
  }
}

/** body 可能是字符串（responseType=text）也可能是对象；都收敛成对象，解析不了给 null。 */
function parseBody(res) {
  try {
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } catch (e) {
    return null;
  }
}

/**
 * **管理端只读口**（仅 ≥SUPER_ADMIN）：编辑态取数的唯一入口。返回**未按视角过滤**的整份内容 ——
 * {@code copy:[{key,label,value}]}（label = 中文名）+ {@code capabilities:[{id,groupName,title,promptText,sortOrder,enabled,audience}]}（含停用行）。
 *
 * <p>**失败如实 reject**：绝不回落成空清单 —— 否则界面看起来像「清单被清空了」，超管一存就把两列覆盖光。
 * @returns {Promise<{copy:Array, capabilities:Array}>}
 */
function fetchAdminContent() {
  return springAuth
    .springRequest({ url: ADMIN_CONTENT_URL, method: 'GET', data: {} })
    .then((res) => {
      const body = parseBody(res);
      if (body && body.success && body.data) return body.data;
      throw new Error((body && body.message) || '读取失败');
    });
}

/**
 * 保存一批「键 → 新值」。空串 = 恢复默认。成功 resolve 服务端提示语，失败 reject Error(原因)。
 * @param {Object<string,string>} values 键值对；键须在 ai.copy. 白名单内（越界键后端整批拒）
 */
function saveCopy(values) {
  return springAuth
    .springRequest({ url: COPY_URL, method: 'POST', data: values || {} })
    .then((res) => {
      const body = parseBody(res);
      if (body && body.success) return body.message || '已保存';
      throw new Error((body && body.message) || '保存失败');
    });
}

/**
 * 整份保存能力清单（新增 / 改 / 删 / 排序一次提交）。成功 resolve 落库后的清单，失败 reject Error。
 * @param {Array<{id:(number|null),groupName:string,title:string,promptText:string,sortOrder:number,enabled:boolean}>} items
 */
function saveCapabilities(items) {
  return springAuth
    .springRequest({ url: CAPABILITIES_URL, method: 'POST', data: items || [] })
    .then((res) => {
      const body = parseBody(res);
      if (body && body.success) return body.data || [];
      throw new Error((body && body.message) || '保存失败');
    });
}

module.exports = {
  isAdmin,
  fetchAdminContent,
  saveCopy,
  saveCapabilities,
  COPY_URL,
  CAPABILITIES_URL,
  ADMIN_CONTENT_URL,
};
