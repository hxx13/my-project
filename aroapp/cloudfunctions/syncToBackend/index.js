const cloud = require('wx-server-sdk');
const axios = require('axios');
const FormData = require('form-data');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ========== 配置（按你的实际值修改） ==========
const BACKEND_BASE = 'http://47.101.61.184:8080';
const SYNC_SECRET = 'twin-upload-sync-2026';
// =============================================

/**
 * 小程序上传图片到微信云存储后，调用此函数同步到后端。
 *
 * @param {object} event
 * @param {string} event.wechatFileID  - 微信云存储 fileID（必填）
 * @param {string} event.originalName  - 原始文件名（可选）
 * @param {string} event.mimeType      - MIME 类型（可选，如 image/jpeg）
 * @returns {{ success: boolean, publicUrl?: string, recordId?: number, wechatFileID?: string, message?: string }}
 */
exports.main = async (event) => {
  const { wechatFileID, originalName, mimeType } = event;

  if (!wechatFileID) {
    return { success: false, message: 'wechatFileID 不能为空' };
  }

  try {
    // 1. 从微信云下载文件到云函数临时内存
    const downloadResult = await cloud.downloadFile({ fileID: wechatFileID });
    const fileBuffer = downloadResult.fileContent;

    // 2. 构建 multipart/form-data
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: originalName || 'mini-program-upload.jpg',
      contentType: mimeType || 'image/jpeg',
    });
    form.append('wechatFileId', wechatFileID);
    if (originalName) form.append('originalName', originalName);
    if (mimeType) form.append('mimeType', mimeType);

    // 3. POST 到后端 /api/upload/sync/register
    const res = await axios.post(
      `${BACKEND_BASE}/api/upload/sync/register`,
      form,
      {
        headers: {
          'X-Sync-Secret': SYNC_SECRET,
          ...form.getHeaders(),
        },
        timeout: 60000,
        maxContentLength: 30 * 1024 * 1024,      // 30MB
        maxBodyLength: 30 * 1024 * 1024,
      }
    );

    const result = res.data;

    if (!result.success) {
      return { success: false, message: result.message || '后端同步失败' };
    }

    // 4. 返回双端 URL 给小程序前端
    return {
      success: true,
      wechatFileID,                       // 小程序自己用，秒加载
      publicUrl: result.data.publicUrl,   // 存入数据库给 Web 用
      recordId: result.data.recordId,     // upload_file_record 记录 ID
    };
  } catch (err) {
    console.error('syncToBackend 失败:', err.message);
    return { success: false, message: err.message };
  }
};
