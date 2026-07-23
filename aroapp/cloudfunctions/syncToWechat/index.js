const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const BACKEND_BASE = 'http://47.101.61.184:8080';
const SYNC_SECRET = 'twin-upload-sync-2026';
const BATCH = 4; // 每次 4 张，3 秒内完成

/**
 * 定时触发器 + 自动链式：Web 上传的图片 → 下载 → 上传微信云 → 回填 fileID。
 * 处理完一批后自动调用自己处理下一批，直到没有待同步记录。
 */
exports.main = async (event) => {
  let synced = 0, failed = 0;

  try {
    const listRes = await axios.get(`${BACKEND_BASE}/api/upload/records/pending-sync`, {
      params: { limit: BATCH },
      headers: { 'X-Sync-Secret': SYNC_SECRET },
      timeout: 15000,
    });

    const records = listRes.data?.data;
    if (!records || records.length === 0) {
      return { synced: 0, message: '无待同步' };
    }

    console.log(`[syncToWechat] ${records.length} 条待同步`);

    for (const r of records) {
      try {
        const dl = await axios.get(r.publicUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buf = Buffer.from(dl.data);
        const upload = await cloud.uploadFile({
          cloudPath: `web-sync/${r.storageKey}`,
          fileContent: buf,
        });

        await axios.put(
          `${BACKEND_BASE}/api/upload/records/${r.id}/wechat-file-id`,
          `wechatFileId=${encodeURIComponent(upload.fileID)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Sync-Secret': SYNC_SECRET,
            },
            timeout: 15000,
          }
        );

        synced++;
        console.log(`[syncToWechat] ✅ record ${r.id} → ${upload.fileID}`);
      } catch (e) {
        failed++;
        console.error(`[syncToWechat] ❌ record ${r.id}:`, e.message);
      }
    }

    // 还有剩余？自动链式调用自己
    const check = await axios.get(`${BACKEND_BASE}/api/upload/records/pending-sync`, {
      params: { limit: 1 },
      headers: { 'X-Sync-Secret': SYNC_SECRET },
      timeout: 10000,
    });
    if (check.data?.data?.length > 0) {
      cloud.callFunction({
        name: 'syncToWechat',
        data: {},
      }).catch(e => console.error('[syncToWechat] 链式调用失败:', e.message));
    }

    return { synced, failed, message: `同步 ${synced} 张, 失败 ${failed}` };
  } catch (e) {
    console.error('[syncToWechat] 失败:', e.message);
    return { synced, failed, message: e.message };
  }
};
