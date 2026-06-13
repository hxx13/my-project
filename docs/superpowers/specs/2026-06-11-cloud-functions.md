# 小程序云函数：双端图片同步

## 文件结构（在微信开发者工具的 cloudfunctions/ 目录下）

```
cloudfunctions/
├── syncToBackend/
│   ├── index.js
│   ├── package.json
│   └── config.json
├── syncToWechat/
│   ├── index.js
│   ├── package.json
│   └── config.json
└── getDualImageSrc/
    ├── index.js
    ├── package.json
    └── config.json
```

---

## 云函数 A: syncToBackend（小程序上传后调用）

**触发方式：** 小程序前端 `wx.cloud.callFunction({ name: 'syncToBackend', data: {...} })`

**作用：** 小程序上传图片到微信云存储后，调此函数把文件同步到后端，让 Web 端也能看到。

```js
// cloudfunctions/syncToBackend/index.js
const cloud = require('wx-server-sdk');
const fetch = require('node-fetch');
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
 * @returns {{ publicUrl: string, recordId: number, wechatFileID: string }}
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

    // 2. 构建 multipart/form-data 请求
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: originalName || 'mini-program-upload.jpg',
      contentType: mimeType || 'image/jpeg',
    });
    form.append('wechatFileId', wechatFileID);
    if (originalName) form.append('originalName', originalName);
    if (mimeType) form.append('mimeType', mimeType);

    // 3. POST 到后端 /api/upload/sync/register
    const res = await fetch(`${BACKEND_BASE}/api/upload/sync/register`, {
      method: 'POST',
      headers: {
        'X-Sync-Secret': SYNC_SECRET,
        ...form.getHeaders(),
      },
      body: form,
    });

    const result = await res.json();

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
    console.error('syncToBackend 失败:', err);
    return { success: false, message: err.message };
  }
};
```

**package.json:**

```json
{
  "name": "syncToBackend",
  "version": "1.0.0",
  "description": "小程序上传后同步文件到后端",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest",
    "node-fetch": "^2.6.0",
    "form-data": "^4.0.0"
  }
}
```

**config.json（权限配置）:**

```json
{
  "permissions": {
    "openapi": []
  }
}
```

---

## 云函数 B: syncToWechat（定时触发器）

**触发方式：** 定时触发器（建议每 1 分钟），或手动调用

**作用：** 轮询后端，把 Web 上传的文件拉到微信云存储，让小程序也能看。

```js
// cloudfunctions/syncToWechat/index.js
const cloud = require('wx-server-sdk');
const fetch = require('node-fetch');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ========== 配置（按你的实际值修改） ==========
const BACKEND_BASE = 'http://47.101.61.184:8080';
const SYNC_SECRET = 'twin-upload-sync-2026';
const BATCH_SIZE = 10;  // 每次处理 10 条
// =============================================

/**
 * 定时触发器：轮询后端待同步文件，下载后上传到微信云存储，回填 fileID。
 *
 * @param {object} event  - 云函数调用参数（定时触发时为空）
 * @param {object} context
 * @returns {{ synced: number, failed: number, details: array }}
 */
exports.main = async (event, context) => {
  const details = [];
  let synced = 0;
  let failed = 0;

  try {
    // 1. 查询待同步的文件列表
    const listRes = await fetch(
      `${BACKEND_BASE}/api/upload/records/pending-sync?limit=${BATCH_SIZE}`,
      { headers: { 'X-Sync-Secret': SYNC_SECRET } }
    );
    const { data: records } = await listRes.json();

    if (!records || records.length === 0) {
      return { synced: 0, failed: 0, message: '无待同步文件' };
    }

    console.log(`找到 ${records.length} 个待同步文件`);

    // 2. 逐个处理
    for (const record of records) {
      try {
        // 2a. 从公网后端下载文件
        const downloadUrl = record.publicUrl.startsWith('http')
          ? record.publicUrl
          : `${BACKEND_BASE}${record.publicUrl}`;

        console.log(`下载: ${downloadUrl}`);
        const downloadRes = await fetch(downloadUrl);

        if (!downloadRes.ok) {
          console.error(`下载失败 [${record.id}]: HTTP ${downloadRes.status}`);
          failed++;
          details.push({ id: record.id, status: 'download_failed', httpStatus: downloadRes.status });
          continue;
        }

        const buffer = await downloadRes.buffer();

        // 2b. 上传到微信云存储
        const cloudPath = `sync/${record.storageKey}`;
        console.log(`上传微信云: ${cloudPath}`);
        const cloudUpload = await cloud.uploadFile({
          cloudPath,
          fileContent: buffer,
        });

        console.log(`微信云 fileID: ${cloudUpload.fileID}`);

        // 2c. 回填 wechat_file_id 到后端
        const putRes = await fetch(
          `${BACKEND_BASE}/api/upload/records/${record.id}/wechat-file-id`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Sync-Secret': SYNC_SECRET,
            },
            body: `wechatFileId=${encodeURIComponent(cloudUpload.fileID)}`,
          }
        );

        if (!putRes.ok) {
          console.error(`回填失败 [${record.id}]: HTTP ${putRes.status}`);
          failed++;
          details.push({ id: record.id, status: 'backfill_failed', httpStatus: putRes.status });
          continue;
        }

        synced++;
        details.push({ id: record.id, status: 'synced', wechatFileID: cloudUpload.fileID });
        console.log(`✅ 同步完成: record ${record.id} → ${cloudUpload.fileID}`);
      } catch (err) {
        console.error(`同步异常 [${record.id}]:`, err.message);
        failed++;
        details.push({ id: record.id, status: 'error', error: err.message });
      }
    }

    return { synced, failed, details };
  } catch (err) {
    console.error('syncToWechat 整体失败:', err);
    return { synced, failed, message: err.message };
  }
};
```

**package.json:**

```json
{
  "name": "syncToWechat",
  "version": "1.0.0",
  "description": "定时轮询后端，同步 Web 上传的文件到微信云存储",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest",
    "node-fetch": "^2.6.0"
  }
}
```

**config.json（包含定时触发器）:**

```json
{
  "permissions": {
    "openapi": []
  },
  "triggers": [
    {
      "name": "syncTimer",
      "type": "timer",
      "config": "0 */1 * * * * *"
    }
  ]
}
```

> `"0 */1 * * * * *"` = 每 1 分钟触发一次。可根据实际需要调整。生产环境建议 30-60 秒。

---

## 云函数 C: getDualImageSrc（给小程序前端用的图片 URL 解析）

**触发方式：** 小程序前端 `wx.cloud.callFunction({ name: 'getDualImageSrc', data: { recordId: 123 } })`

**作用：** 小程序根据 recordId 获取适合渲染的图片 URL。优先返回 `wechatFileID`（本地秒加载），其次 `publicUrl`。

```js
// cloudfunctions/getDualImageSrc/index.js
const fetch = require('node-fetch');

// ========== 配置 ==========
const BACKEND_BASE = 'http://47.101.61.184:8080';
// 注意：这个函数是小程序前端调用的，不需要 sync-secret。
// 后端 GET /records/{id} 走 JWT 认证，所以需要传一个服务账号的 JWT。
// 简单做法：后端侧 GET /records/{id} 不走 JWT（它只是读文件 URL，不暴露敏感数据）
// 或者从云函数环境变量中拿 JWT token
const SYNC_SECRET = 'twin-upload-sync-2026';  // 如果后端允许 sync-secret 读单条记录
// =============================================

/**
 * 小程序根据 recordId 获取最佳图片 URL。
 * 优先使用 wechatFileID → wx.cloud.getTempFileURL 换取临时链接（快），
 * 兜底使用 publicUrl（稍慢但一定能加载）。
 *
 * @param {object} event
 * @param {number} event.recordId  - upload_file_record.id
 * @returns {{ src: string, type: 'wechat' | 'public' | 'none' }}
 */
exports.main = async (event) => {
  const { recordId } = event;

  if (!recordId) {
    return { success: false, src: null, type: 'none', message: 'recordId 不能为空' };
  }

  try {
    // 1. 查询文件记录（拿到 wechatFileID 和 publicUrl）
    const res = await fetch(`${BACKEND_BASE}/api/upload/records/${recordId}`, {
      headers: { 'X-Sync-Secret': SYNC_SECRET },
    });
    const { data: record } = await res.json();

    if (!record) {
      return { success: false, src: null, type: 'none', message: '记录不存在' };
    }

    // 2. 优先返回微信云 fileID（小程序内加载快）
    if (record.wechatFileId) {
      return {
        success: true,
        src: record.wechatFileId,       // 传给 <image src="{{fileID}}"> 或 wx.cloud.getTempFileURL
        type: 'wechat',
        publicUrl: record.publicUrl,    // 兜底
      };
    }

    // 3. 兜底：用公网 URL（可能加载慢一点，但一定能用）
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
    console.error('getDualImageSrc 失败:', err);
    return { success: false, src: null, type: 'none', message: err.message };
  }
};
```

**package.json:**

```json
{
  "name": "getDualImageSrc",
  "version": "1.0.0",
  "description": "根据记录 ID 获取小程序端最佳渲染的图片 URL",
  "main": "index.js",
  "dependencies": {
    "node-fetch": "^2.6.0"
  }
}
```

---

## 小程序前端调用示例

### 上传图片流程

```js
// pages/xxx/xxx.js

// 1. 用户选择图片 → 上传到微信云存储（快）
wx.chooseImage({
  count: 1,
  success: async (chooseRes) => {
    const tempPath = chooseRes.tempFilePaths[0];

    // 上传到微信云存储
    const cloudRes = await wx.cloud.uploadFile({
      cloudPath: `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      filePath: tempPath,
    });

    const wechatFileID = cloudRes.fileID;  // 小程序直读这个 fileID 秒加载

    // 2. 调云函数同步到后端（异步，不阻塞用户）
    wx.cloud.callFunction({
      name: 'syncToBackend',
      data: {
        wechatFileID,
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
      },
      success: (syncRes) => {
        if (syncRes.result.success) {
          // 把这个 recordId + publicUrl 随表单一起提交到后端数据库
          console.log('后端同步成功', syncRes.result.publicUrl);
        }
      },
      fail: (err) => console.error('同步失败', err),
    });

    // 3. 页面立刻展示图片（用 wechatFileID，秒加载）
    this.setData({
      imageSrc: wechatFileID,  // <image src="{{imageSrc}}"> 直接渲染
    });
  },
});
```

### 渲染图片（自动选择最优 URL）

```js
// 已知 recordId，获取最佳图片 URL
wx.cloud.callFunction({
  name: 'getDualImageSrc',
  data: { recordId: 123 },
  success: (res) => {
    if (res.result.type === 'wechat') {
      // 有微信云 fileID → 用 wx.cloud.getTempFileURL 换取临时 HTTPS 链接
      wx.cloud.getTempFileURL({
        fileList: [res.result.src],
        success: (temp) => {
          this.setData({ imageSrc: temp.fileList[0].tempFileURL });
        },
      });
    } else if (res.result.type === 'public') {
      // 兜底：直接用公网 URL（首次加载较慢，但不会失败）
      this.setData({ imageSrc: res.result.src });
    } else {
      // 无图片 — 显示占位
      this.setData({ imageSrc: '' });
    }
  },
});
```

### WXML 模板

```html
<!-- 有 wechatFileID 时直接用 cloud:// 格式（小程序原生支持，秒加载） -->
<image
  wx:if="{{imageSrc && imageSrc.indexOf('cloud://') === 0}}"
  src="{{imageSrc}}"
  mode="aspectFill"
  lazy-load
/>

<!-- 公网 URL（加载较慢的兜底） -->
<image
  wx:elif="{{imageSrc}}"
  src="{{imageSrc}}"
  mode="aspectFill"
  lazy-load
/>

<!-- 无图片占位 -->
<view wx:else class="placeholder">暂无图片</view>
```
