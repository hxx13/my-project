/*
 * @Date: 2026-04-03 10:09:00
 * @LastEditTime: 2026-04-16 15:16:42
 * @FilePath: \aroapp\miniprogram\app.js
 */
// app.js
// 单条保存成功后：禁止为同步一条数据而整表 loadData({ reset: true }) / 全量重拉列表；应 setData 合并对应行。
// 与 Web 管理端同一约束，见仓库根目录 .cursor/rules/post-save-no-full-refresh.mdc

function parseResponseData(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { _raw: raw };
    }
  }
  return { _raw: String(raw) };
}

function isPlainEmptyObject(data) {
  return (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.keys(data).length === 0
  );
}

function pickErrMsg(data, statusCode) {
  if (statusCode === 200 && isPlainEmptyObject(data)) {
    return 'HTTP 200 但返回空对象{}，请核对接口路径/域名或改用表单提交';
  }
  if (!data || typeof data !== 'object') {
    return statusCode && statusCode !== 200 ? `HTTP ${statusCode}` : '响应体为空或非 JSON';
  }
  if (typeof data._raw === 'string') {
    const s = data._raw.trim();
    if (!s) return 'HTTP 200 但响应体为空字符串';
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  const bizMsg =
    data.message ||
    data.msg ||
    data.error ||
    data.errMsg ||
    data.errorMessage ||
    data.description;
  if (bizMsg) return bizMsg;

  if (statusCode && statusCode !== 200) return `HTTP ${statusCode}`;
  if (isPlainEmptyObject(data)) return '服务端未返回业务字段';
  // 有业务 status/code 但无文案时，避免误显示「未知错误」
  const st = data.status;
  const cd = data.code;
  if (st !== undefined && st !== null && st !== '') {
    return `业务 status=${st}（请对照接口文档）`;
  }
  if (cd !== undefined && cd !== null && cd !== '') {
    return `业务 code=${cd}（请对照接口文档）`;
  }
  return '未知错误';
}

/** 若响应里已有 token，视为业务成功（兼容无 code 字段的接口） */
function loginOk(data, statusCode) {
  if (statusCode !== 200) return false;
  if (pickToken(data)) return true;
  if (!data || typeof data !== 'object' || data._raw !== undefined) return false;
  const c = data.code;
  if (c === 200 || c === 0 || c === '200' || c === '0') return true;
  // 常见：status 表示业务态，0 为成功（与 HTTP statusCode 不同）
  const s = data.status;
  if (s === 200 || s === 0 || s === '200' || s === '0') return true;
  if (data.success === true) return true;
  return false;
}

function pickToken(data) {
  if (!data || typeof data !== 'object') return '';

  if (typeof data._raw === 'string') {
    const s = data._raw.trim();
    if (!s) return '';
    // 常见 JWT 形态，或接口直接返回纯 token 字符串
    if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(s)) return s;
    if (s.length >= 16 && /^[\w\-._+]+$/.test(s)) return s;
    return '';
  }

  const inner = data.data || data.Data || data.result || data.body;
  if (inner && typeof inner === 'string') {
    try {
      const parsed = JSON.parse(inner);
      if (parsed && parsed.token) return String(parsed.token).trim();
    } catch (e) {
      // inner 可能是纯 token 字符串
      if (inner.length >= 16) return inner.trim();
    }
  }
  if (Array.isArray(inner) && inner[0] && typeof inner[0] === 'object') {
    const t = inner[0].token || inner[0].accessToken;
    if (t && typeof t === 'string') return t.trim();
  }
  if (inner && typeof inner === 'object') {
    const t =
      inner.token || inner.accessToken || inner.access_token || inner.Token;
    if (t && typeof t === 'string') return t.trim();
  }

  const candidates = [
    data.token,
    data.accessToken,
    data.access_token,
    data.Token,
    data.data && typeof data.data === 'string' ? data.data : '',
    data.data && data.data.token,
    data.data && (data.data.accessToken || data.data.access_token),
    data.Data && data.Data.token,
    data.Data && (data.Data.accessToken || data.Data.access_token),
    data.result && data.result.token,
    data.result && (data.result.accessToken || data.result.access_token),
    data.body && data.body.token,
  ];
  for (let i = 0; i < candidates.length; i++) {
    const v = candidates[i];
    if (v && typeof v === 'string') return v.trim();
  }
  return '';
}

const springAuth = require('./utils/springAuth.js');
const envConfig = require('./utils/envConfig.js');
const pagePermission = require('./utils/pagePermission.js');

App({
  globalData: {
    /** 同一小程序启动周期内首屏版本更新公告只尝试展示一次（未点「知道了」也会占用，避免多 Tab 重复弹出） */
    splashShownThisSession: false,
  },
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: envConfig.getEffectiveCloudEnvId(),
        traceUser: true,
      });
      springAuth.refreshPublicRuntimeConfig().then((cfg) => {
        if (cfg) console.log('[app] 已拉取 Spring 公开运行时配置');
        else console.warn('[app] 未拉取到 runtime-config（检查云函数白名单 /api/public 与 SPRING_BASE_URL）');
      });
    } else {
      console.error('[app] 当前基础库不支持 wx.cloud，请检查基础库版本与 app.json 中 cloud 配置');
    }
    // jtu 校园网账号登录（与 Spring 完全独立，勿删）
    this.autoLogin();
    // 并行：微信 code → Spring 静默登录；成功写 spring*，未绑写 springPendingOpenId（不覆盖 jtu 的 token）
    springAuth.runWechatSilentLoginOnLaunch();
    pagePermission.refreshMiniPermissions();
  },

  // 自动登录方法（请把账号密码改为安全配置，勿长期硬编码在客户端）
  autoLogin() {
    const account = '15001771038';
    const password = '88888888';

    wx.request({
      url: 'https://aro.shsmu.edu.cn/jtu/api/login',
      method: 'POST',
      data: {
        account,
        password,
      },
      header: {
        'Content-Type': 'application/json',
      },
      success: (res) => {
        const statusCode = res.statusCode;
        const raw = res.data;
        const data = parseResponseData(raw);

        // 便于排查：控制台看原始类型与序列化结果
        if (raw === '' || raw == null || isPlainEmptyObject(data)) {
          console.warn('[autoLogin] 响应体为空或 {}，原始 res.data:', raw, 'headers:', res.header);
        } else {
          console.log('[autoLogin] 解析后 data:', data);
    
        }

        if (statusCode === 200 && loginOk(data, statusCode)) {
          const token = pickToken(data);
          if (token) {
            wx.setStorageSync('token', token);
            console.log('自动登录成功，token 已保存');
            return;
          }
          console.error('自动登录：判定成功但未解析到 token，完整响应:', data);
          wx.showToast({ title: '登录响应缺少 token', icon: 'none' });
          return;
        }

        const errMsg = pickErrMsg(data, statusCode);
        console.error('自动登录失败:', errMsg, 'status:', statusCode, 'raw:', raw, 'parsed:', data);
        wx.showToast({ title: errMsg.length > 20 ? errMsg.slice(0, 20) + '…' : errMsg, icon: 'none' });
      },
      fail: (err) => {
        const msg = (err && (err.errMsg || err.message)) || '网络异常';
        console.error('自动登录网络失败:', err);
        wx.showToast({ title: msg.includes('fail') ? '请检查域名白名单/网络' : msg, icon: 'none' });
      },
    });
  },

  getAuthToken() {
    return wx.getStorageSync('token') || '';
  },

  /** Spring 自有后端 token（与 jtu token 独立） */
  getSpringToken() {
    return wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
  },
});