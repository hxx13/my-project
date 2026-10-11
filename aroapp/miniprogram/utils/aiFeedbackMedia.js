/**
 * AI 抽屉反馈的选图与直传。
 *
 * <p>做法照抄 `package-feature/utils/workorderMedia.js` 的 `chooseImage` / `uploadImages`，
 * 但**必须在这里重写一份**：那个文件在**分包** package-feature 里，而用它的组件
 * `components/ai-drawer-feedback` 在主包。小程序**不允许主包引用分包文件** ——
 * 分包没被导航打开前，主包 require 它会拿不到、静默失败，所以不能直接 require。
 *
 * <p>只搬反馈用得到的两件事：选图 + 逐张直传（直传走 {@code springAuth.uploadFileDirect}，
 * **不自己写 wx.uploadFile**）。
 */
const springAuth = require('./springAuth.js');

/** 反馈附图上限，与后端 {@code AiDrawerFeedbackService.MAX_IMAGES} 一致。 */
const MAX_IMAGE_COUNT = 6;

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

/**
 * 追加选图并逐张直传，返回「原图 + 新增」的完整地址列表。
 *
 * <p>上限 {@code maxCount} 到底就停：既在选图入口按剩余张数收口（{@code chooseImage(remain)}），
 * 又对返回的每一张显式判 {@code next.length < max} —— **即便选图口真返回超量也逐张截断**，
 * 保证最终 ≤ 上限（后端也只收 6 张）。
 */
async function appendImages(existingUrls, maxCount) {
  const max = maxCount || MAX_IMAGE_COUNT;
  const next = Array.isArray(existingUrls) ? existingUrls.slice() : [];
  const remain = max - next.length;
  if (remain <= 0) return next;
  const files = await chooseImage(remain);
  for (let i = 0; i < files.length && next.length < max; i += 1) {
    const ready = await compressImage(files[i], 65);
    const url = await springAuth.uploadFileDirect(ready, {});
    if (url) next.push(url);
  }
  return next;
}

module.exports = { MAX_IMAGE_COUNT, chooseImage, appendImages };
