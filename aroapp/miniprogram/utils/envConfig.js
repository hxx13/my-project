/**
 * 小程序环境切换（无需重新上传正式版）
 *
 * 原理：每个微信云环境内的 springProxy 配置不同 SPRING_BASE_URL；
 * 客户端只切换 cloudEnvId（storage 键 aroapp_env_override）。
 *
 * 运维：云开发控制台为 test/dev 环境设置 SPRING_BASE_URL，并将环境 ID 填入下方 PRESETS。
 * 切换后请完全关闭小程序再打开。
 */

const STORAGE_KEY = 'aroapp_env_override';

const PRESETS = {
  prod: {
    id: 'prod',
    label: '生产',
    cloudEnvId: 'aroapp-d0gf62u0p13ac9c9c',
    hint: 'ECS 生产 Spring',
  },
  test: {
    id: 'test',
    label: '测试',
    // TODO: 在云开发创建测试环境后，将下方占位 ID 替换为真实 cloudEnvId
    cloudEnvId: 'aroapp-test-REPLACE_ME',
    hint: '测试/staging Spring',
  },
  dev: {
    id: 'dev',
    label: '开发',
    // TODO: 可选；指向 frp 穿透的开发机时，将下方占位 ID 替换为真实 cloudEnvId
    cloudEnvId: 'aroapp-dev-REPLACE_ME',
    hint: '开发机（需 frp）',
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

function getEffectiveCloudEnvId() {
  return PRESETS[getEffectivePresetId()].cloudEnvId;
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
      cloudEnvId: p.cloudEnvId,
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
  getEffectiveCloudEnvId: getEffectiveCloudEnvId,
  setEnvOverride: setEnvOverride,
  clearEnvOverride: clearEnvOverride,
  canShowEnvSwitcher: canShowEnvSwitcher,
  getPresetList: getPresetList,
};
