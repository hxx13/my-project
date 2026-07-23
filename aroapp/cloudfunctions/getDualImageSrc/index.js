const axios = require('axios');

// ========== 配置（按你的实际值修改） ==========
const BACKEND_BASE = 'http://47.101.61.184:8080';
const SYNC_SECRET = 'twin-upload-sync-2026';
// =============================================

/**
 * 小程序根据 recordId 获取最佳图片 URL。
 * 优先使用 wechatFileID → 传给 <image src="{{fileID}}"> 秒加载，
 * 兜底使用 publicUrl（稍慢但一定能加载）。
 *
 * @param {object} event
 * @param {number} event.recordId  - upload_file_record.id
 * @returns {{ success: boolean, src: string|null, type: 'wechat'|'public'|'none', publicUrl?: string, message?: string }}
 */
exports.main = async (event) => {
  const { recordId } = event;

  if (!recordId) {
    return { success: false, src: null, type: 'none', message: 'recordId 不能为空' };
  }

  try {
    // 1. 查询文件记录（拿到 wechatFileID 和 publicUrl）
    const res = await axios.get(
      `${BACKEND_BASE}/api/upload/records/${recordId}`,
      {
        headers: { 'X-Sync-Secret': SYNC_SECRET },
        timeout: 10000,
      }
    );

    const record = res.data && res.data.data;

    if (!record) {
      return { success: false, src: null, type: 'none', message: '记录不存在' };
    }

    // 2. 优先返回微信云 fileID（小程序内用 cloud:// 直读，秒加载）
    if (record.wechatFileId) {
      return {
        success: true,
        src: record.wechatFileId,       // 传给 <image src="{{fileID}}"> 或用 wx.cloud.getTempFileURL 换取临时链接
        type: 'wechat',
        publicUrl: record.publicUrl,    // 兜底
      };
    }

    // 3. 兜底：用公网 URL（首次加载较慢，但一定能用）
    if (record.publicUrl) {
      return {
        success: true,
        src: record.publicUrl,
        type: 'public',
        message: '微信云 fileID 尚未同步，使用公网 URL（首次加载较慢）',
      };
    }

    return { success: false, src: null, type: 'none', message: '无可用图片 URL' };
  } catch (err) {
    console.error('getDualImageSrc 失败:', err.message);
    return { success: false, src: null, type: 'none', message: err.message };
  }
};
