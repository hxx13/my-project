const springAuth = require('../../utils/springAuth.js');
const {
  mapMediaUrlList,
  resolveOneDisplayUrl,
  resolveMediaUrlsForDisplay,
} = require('../../utils/mpDisplayMedia.js');

const MAX_IMAGE_COUNT = 9;
const PREVIEW_DEBOUNCE_MS = 450;
/** 压缩目标：云存储直传不再走云函数 base64，略放宽仍控制体积与计费 */
const MAX_UPLOAD_BASE64_LEN = 1200 * 1024;

let lastPreviewAt = 0;

function markPreviewResumeSkip(page) {
  if (page && typeof page === 'object') {
    page._skipResumeReloadOnce = true;
  }
}

function shouldSkipReloadOnShow(page) {
  if (page && page._skipResumeReloadOnce) {
    page._skipResumeReloadOnce = false;
    return true;
  }
  return false;
}

function chooseImage(count) {
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => resolve(res.tempFilePaths || []),
      fail: (err) => reject(new Error((err && err.errMsg) || '选择图片失败')),
    });
  });
}

function compressImage(filePath, quality) {
  const q = typeof quality === 'number' ? quality : 65;
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: q,
      success: (res) => resolve((res && res.tempFilePath) || filePath),
      fail: () => resolve(filePath),
    });
  });
}

function getBase64Length(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(String(res.data || '').length),
      fail: (err) => reject(new Error((err && err.errMsg) || '读取文件失败')),
    });
  });
}

/**
 * 多次压缩直至 base64 长度低于阈值（用作体积代理），便于云上传与预览。
 */
async function shrinkImageForUpload(filePath) {
  let quality = 65;
  let path = filePath;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    path = await compressImage(path, quality);
    const len = await getBase64Length(path);
    if (len <= MAX_UPLOAD_BASE64_LEN) return path;
    quality -= 12;
    if (quality < 18) break;
  }
  const msg = '图片仍过大，请换一张或裁剪后再试';
  wx.showModal({ title: '无法上传', content: msg, showCancel: false });
  throw new Error(msg);
}

/** 列表页批量解析报修/采购工单附图，合并一次 cloud-mappings 请求 */
async function resolveWorkorderRowsMedia(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  await springAuth.refreshPublicRuntimeConfig().catch(() => null);
  const normalizedPairs = rows.map((r) => ({
    request: mapMediaUrlList(r.requestImages),
    result: mapMediaUrlList(r.resultImages),
  }));
  const allUrls = [];
  normalizedPairs.forEach((p) => {
    p.request.forEach((u) => allUrls.push(u));
    p.result.forEach((u) => allUrls.push(u));
  });
  const unique = Array.from(new Set(allUrls.filter(Boolean)));
  let cloudMappings = {};
  const httpUrls = unique.filter((u) => !u.startsWith('cloud://'));
  if (httpUrls.length) {
    const res = await springAuth.resolveCloudUrls(httpUrls);
    cloudMappings = (res && res.mappings) || {};
  }
  return rows.map((r, i) => ({
    ...r,
    requestImages: normalizedPairs[i].request.map((u) => resolveOneDisplayUrl(u, cloudMappings)).filter(Boolean),
    resultImages: normalizedPairs[i].result.map((u) => resolveOneDisplayUrl(u, cloudMappings)).filter(Boolean),
  }));
}

async function uploadImages(existingUrls, options) {
  const opts = options || {};
  const maxCount = opts.maxCount || MAX_IMAGE_COUNT;
  const cloudDir = opts.cloudDir || 'workorders/common';
  const remain = maxCount - (existingUrls ? existingUrls.length : 0);
  if (remain <= 0) {
    wx.showToast({ title: `最多上传${maxCount}张`, icon: 'none' });
    return existingUrls || [];
  }
  const files = await chooseImage(remain);
  if (!files.length) return existingUrls || [];
  const next = Array.isArray(existingUrls) ? existingUrls.slice() : [];
  for (let i = 0; i < files.length; i += 1) {
    const src = files[i];
    const ready = await shrinkImageForUpload(src);
    const fileID = await springAuth.uploadCloudMediaFile(ready, cloudDir);
    next.push(springAuth.toAbsoluteMediaUrl(fileID));
    // 异步同步到后端（不阻塞上传流程）
    wx.cloud.callFunction({
      name: 'syncToBackend',
      data: { wechatFileID: fileID, originalName: 'workorder-image.jpg', mimeType: 'image/jpeg' },
    }).catch(() => {});
  }
  return next;
}

function previewImages(urls, currentUrl, page) {
  const raw = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (!raw.length) return;
  const list = raw.filter(Boolean);
  if (!list.length) return;
  const now = Date.now();
  if (now - lastPreviewAt < PREVIEW_DEBOUNCE_MS) return;
  lastPreviewAt = now;
  markPreviewResumeSkip(page);
  const cur = currentUrl ? String(currentUrl).trim() : list[0];
  wx.previewImage({
    current: cur || list[0],
    urls: list,
  });
}

module.exports = {
  MAX_IMAGE_COUNT,
  MAX_UPLOAD_BASE64_LEN,
  uploadImages,
  previewImages,
  mapMediaUrlList,
  resolveMediaUrlsForDisplay,
  resolveWorkorderRowsMedia,
  shouldSkipReloadOnShow,
};
