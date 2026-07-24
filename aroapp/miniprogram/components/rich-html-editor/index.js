const springAuth = require('../../utils/springAuth.js');

const HTML_SNIPPETS = {
  p: '<p>在这里写一段普通说明文字。</p>',
  br: '<br/>',
  strong: '<p><strong>这里是需要强调的重点</strong></p>',
  em: '<p><em>补充说明、次要语气</em></p>',
  ul: '<ul><li>第一条</li><li>第二条</li><li>第三条</li></ul>',
  ol: '<ol><li>步骤一</li><li>步骤二</li><li>步骤三</li></ol>',
  tip: '<div style="padding:12px;background:#ecf7ff;border-radius:8px;color:#1989fa;font-size:14px;">提示：可把这段改成你的注意事项（蓝底信息框）。</div>',
  note: '<p style="color:#969799;font-size:13px;line-height:1.6;">灰色小字：适合写版本范围、依赖条件等次要信息。</p>',
  hr: '<p style="border-top:1px solid #ebedf0;margin:12px 0;padding:0;height:0;">&nbsp;</p>',
  h: '<p style="font-size:16px;font-weight:700;margin:8px 0 4px;">小标题</p><p>标题下的说明</p>',
};

function guessImageMeta(tempPath) {
  const p = String(tempPath || '').toLowerCase();
  const ts = Date.now();
  if (p.endsWith('.png')) return { fileName: `editor_${ts}.png`, mimeType: 'image/png' };
  if (p.endsWith('.webp')) return { fileName: `editor_${ts}.webp`, mimeType: 'image/webp' };
  if (p.endsWith('.gif')) return { fileName: `editor_${ts}.gif`, mimeType: 'image/gif' };
  return { fileName: `editor_${ts}.jpg`, mimeType: 'image/jpeg' };
}

function normalizeUploadedImageUrl(url) {
  let u = String(url || '').trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('cloud://')) return '';
  if (typeof springAuth.toAbsoluteApiUrl === 'function') {
    const abs = springAuth.toAbsoluteApiUrl(u);
    if (abs && /^https?:\/\//i.test(abs)) return abs;
  }
  if (typeof springAuth.toAbsoluteMediaUrl === 'function') {
    const abs2 = springAuth.toAbsoluteMediaUrl(u);
    if (abs2 && /^https?:\/\//i.test(abs2)) return abs2;
  }
  return u;
}

Component({
  properties: {
    value: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
  },
  data: {},
  methods: {
    emitChange(next) {
      this.triggerEvent('change', { value: next != null ? String(next) : '' });
    },
    onBodyInput(e) {
      const raw = e.detail;
      const v = raw != null && typeof raw === 'object' && raw.value != null ? raw.value : raw;
      this.emitChange(v != null ? String(v) : '');
    },
    appendHtmlSnippet(e) {
      const key = e.currentTarget.dataset.key;
      const snippet = HTML_SNIPPETS[key];
      if (!snippet) return;
      let cur = String(this.properties.value || '');
      if (cur.length && !/\n$/.test(cur)) cur += '\n';
      cur += snippet;
      this.emitChange(cur);
    },
    async insertImageFromAlbum() {
      if (this.properties.disabled) return;
      const runUpload = async (tempFilePath) => {
        if (!tempFilePath) {
          wx.showToast({ title: '请先添加图片', icon: 'none' });
          return;
        }
        const meta = guessImageMeta(tempFilePath);
        wx.showLoading({ title: '上传中', mask: true });
        try {
          let url = await springAuth.uploadSpringFile(tempFilePath, meta);
          url = normalizeUploadedImageUrl(url);
          if (!url || !/^https?:\/\//i.test(url)) {
            throw new Error('上传成功但未得到可访问的图片地址，请在管理端配置上传/接口公网 Base');
          }
          const esc = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          const img = `<p><img src="${esc}" style="max-width:100%;height:auto;"/></p>`;
          const cur = String(this.properties.value || '');
          this.emitChange(cur + img);
          wx.showToast({ title: '已插入图片', icon: 'success' });
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none', duration: 2800 });
        } finally {
          wx.hideLoading();
        }
      };

      const tryChooseImage = () => {
        if (typeof wx.chooseImage !== 'function') {
          wx.showToast({ title: '当前环境不支持选图', icon: 'none' });
          return;
        }
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: (r) => {
            const p = (r.tempFilePaths && r.tempFilePaths[0]) || '';
            void runUpload(p);
          },
          fail: (err2) => {
            wx.showToast({ title: (err2 && err2.errMsg) || '无法选择图片', icon: 'none' });
          },
        });
      };

      const tryChooseMedia = () => {
        if (typeof wx.chooseMedia !== 'function') {
          tryChooseImage();
          return;
        }
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: (r) => {
            const f = r.tempFiles && r.tempFiles[0];
            const p = (f && f.tempFilePath) || '';
            void runUpload(p);
          },
          fail: (err) => {
            const msg = (err && err.errMsg) || '';
            if (/cancel|取消/i.test(msg)) return;
            tryChooseImage();
          },
        });
      };

      tryChooseMedia();
    },
  },
});
