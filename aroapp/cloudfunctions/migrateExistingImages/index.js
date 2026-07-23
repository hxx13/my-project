const cloud = require('wx-server-sdk');
const axios = require('axios');
const FormData = require('form-data');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ========== 配置 ==========
const BACKEND_BASE = 'http://47.101.61.184:8080';
const SYNC_SECRET = 'twin-upload-sync-2026';
const BATCH_SIZE = 5; // 每次只处理 5 张，防止 3 秒超时
// ==========================

/**
 * 微信云免费版有 3 秒限制，每次只处理 BATCH_SIZE 张。
 * 传入 { startIndex: 0 } 开始，返回 nextStartIndex，再传入继续，直到 done=true。
 */
exports.main = async (event) => {
  const startIndex = event.startIndex || 0;
  const errors = [];
  let synced = 0;

  try {
    console.log(`[迁移] 扫描 (startIndex=${startIndex})...`);
    const scanRes = await axios.get(
      `${BACKEND_BASE}/api/upload/sync/cloud-urls`,
      { headers: { 'X-Sync-Secret': SYNC_SECRET }, timeout: 30000 }
    );

    const cloudUrls = scanRes.data?.data?.cloudUrls || [];
    if (cloudUrls.length === 0) return { done: true, synced: 0, message: '无 cloud:// URL' };
    if (startIndex >= cloudUrls.length) return { done: true, synced: 0, message: '已全部处理完' };

    const endIndex = Math.min(startIndex + BATCH_SIZE, cloudUrls.length);
    console.log(`[迁移] 本批 ${startIndex}-${endIndex - 1} / 共 ${cloudUrls.length}`);

    for (let i = startIndex; i < endIndex; i++) {
      const cloudUrl = cloudUrls[i];
      try {
        console.log(`[迁移] (${i + 1}) ${cloudUrl.substring(0, 50)}...`);
        const dl = await cloud.downloadFile({ fileID: cloudUrl });

        const form = new FormData();
        form.append('file', dl.fileContent, { filename: `migrate-${i}.jpg`, contentType: 'image/jpeg' });
        form.append('wechatFileId', cloudUrl);
        form.append('originalName', `migrated-${i}`);
        form.append('mimeType', 'image/jpeg');

        const res = await axios.post(`${BACKEND_BASE}/api/upload/sync/register`, form, {
          headers: { 'X-Sync-Secret': SYNC_SECRET, ...form.getHeaders() },
          timeout: 60000,
          maxContentLength: 30 * 1024 * 1024,
          maxBodyLength: 30 * 1024 * 1024,
        });

        if (res.data?.success) {
          synced++;
          console.log(`[迁移] ✅ → ${res.data.data.publicUrl}`);
        } else {
          errors.push({ i, cloudUrl, error: res.data?.message });
        }
      } catch (e) {
        console.error(`[迁移] ❌ ${cloudUrl.substring(0, 40)}...`, e.message);
        errors.push({ i, cloudUrl, error: e.message });
      }
    }

    const done = endIndex >= cloudUrls.length;

    // 自动链式调用：还没处理完就自己触发下一批
    if (!done) {
      cloud.callFunction({
        name: 'migrateExistingImages',
        data: { startIndex: endIndex },
      }).catch(e => console.error('[迁移] 链式调用失败:', e.message));
    }

    return {
      done,
      nextStartIndex: done ? null : endIndex,
      scanned: cloudUrls.length,
      synced,
      message: done ? `全部完成!` : `已自动触发下一批 (startIndex=${endIndex})`,
      errors: errors.slice(0, 10),
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
};
