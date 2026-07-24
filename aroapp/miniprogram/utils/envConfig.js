/**
 * 小程序环境切换（无需重新上传正式版）
 *
 * 原理：客户端通过 apiBaseUrl 直连后端 Spring 服务（wx.request），不再经过微信云函数代理。
 * 切换环境即切换 apiBaseUrl（storage 键 aroapp_env_override）。
 *
 * 切换后请完全关闭小程序再打开。
 */

const STORAGE_KEY = 'aroapp_env_override';

const PRESETS = {
  prod: {
    id: 'prod',
    label: '正式',
    apiBaseUrl: 'https://aroultra.shsmu.edu.cn',
    hint: '生产环境',
  },
  dev: {
    id: 'dev',
    label: '开发',
    apiBaseUrl: 'http://localhost:8081',
    hint: '本地开发机',
  },
};

function getEnvVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || 'release';
  } catch (e) {
    return 'release';
  }
}

function getDefaultPresetId() {
  return 'prod';
}

function getEffectivePresetId() {
  try {
    var o = wx.getStorageSync(STORAGE_KEY);
    if (o && PRESETS[o]) return o;
  } catch (e) {
    /* ignore */
  }
  return getDefaultPresetId();
}

function getEffectiveApiBaseUrl() {
  return PRESETS[getEffectivePresetId()].apiBaseUrl;
}

/**
 * @deprecated 迁移期兼容别名，始终返回生产环境 cloudEnvId。
 *             新代码请使用 getEffectiveApiBaseUrl()。
 */
function getEffectiveCloudEnvId() {
  return 'aroapp-d0gf62u0p13ac9c9c';
}

function setEnvOverride(id) {
  var key = id != null ? String(id).trim() : '';
  if (!key || !PRESETS[key]) {
    throw new Error('无效的环境：' + key);
  }
  wx.setStorageSync(STORAGE_KEY, key);
}

function clearEnvOverride() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (e) {
    /* ignore */
  }
}

function canShowEnvSwitcher(role) {
  var v = getEnvVersion();
  if (v !== 'release') return true;
  var r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'PLATFORM_OWNER' || r === 'SUPER_ADMIN';
}

function getPresetList() {
  return Object.keys(PRESETS).map(function (key) {
    var p = PRESETS[key];
    return {
      id: p.id,
      label: p.label,
      apiBaseUrl: p.apiBaseUrl,
      hint: p.hint,
    };
  });
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  PRESETS: PRESETS,
  getEnvVersion: getEnvVersion,
  getDefaultPresetId: getDefaultPresetId,
  getEffectivePresetId: getEffectivePresetId,
  getEffectiveApiBaseUrl: getEffectiveApiBaseUrl,
  getEffectiveCloudEnvId: getEffectiveCloudEnvId,
  setEnvOverride: setEnvOverride,
  clearEnvOverride: clearEnvOverride,
  canShowEnvSwitcher: canShowEnvSwitcher,
  getPresetList: getPresetList,
};
