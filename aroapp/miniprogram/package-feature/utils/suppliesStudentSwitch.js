const springAuth = require('../../utils/springAuth.js');
const { hasMinRole, isStudentAccount } = require('../../utils/roleAccess.js');
const pagePermission = require('../../utils/pagePermission.js');

function canShowStudentMaterialSwitch(role) {
  const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
  if (!token) return false;
  return pagePermission.canShowMiniEntry('mine', '/package-feature/pages/studentMaterial/index', role || 'STUDENT', 'STUDENT');
}

function resolveSuppliesUrl(role) {
  const r = role || wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  const mallPath = '/package-feature/pages/supplies/index';
  const canMall =
    pagePermission.canAccessMiniPage(mallPath, r, 'ADMIN') ||
    pagePermission.canShowMiniEntry('home', mallPath, r, 'ADMIN');
  if (canMall) return mallPath;
  const minePath = '/package-feature/pages/suppliesMine/index';
  const canMine = hasMinRole(r, 'STAFF') && pagePermission.canAccessMiniPage(minePath, r, 'STAFF');
  if (canMine) return minePath;
  return '';
}

function canShowSuppliesSwitch(role) {
  return !!resolveSuppliesUrl(role);
}

function goStudentMaterial() {
  const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  if (!canShowStudentMaterialSwitch(role)) {
    wx.showToast({ title: '无权限', icon: 'none' });
    return;
  }
  const pages = getCurrentPages();
  const cur = pages.length ? pages[pages.length - 1] : null;
  if (cur && typeof cur.setData === 'function') {
    cur.setData({ cartSheetShow: false, confirmOpen: false, specPopoverItemId: 0 });
  }
  wx.redirectTo({ url: '/package-feature/pages/studentMaterial/index' });
}

function goSupplies() {
  const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  const url = resolveSuppliesUrl(role);
  if (!url) {
    wx.showToast({ title: '无权限', icon: 'none' });
    return;
  }
  const pages = getCurrentPages();
  const cur = pages.length ? pages[pages.length - 1] : null;
  if (cur && typeof cur.setData === 'function') {
    cur.setData({ cartSheetShow: false, confirmOpen: false, specPopoverItemId: 0 });
  }
  wx.redirectTo({ url });
}

module.exports = {
  canShowStudentMaterialSwitch,
  canShowSuppliesSwitch,
  goStudentMaterial,
  goSupplies,
};
