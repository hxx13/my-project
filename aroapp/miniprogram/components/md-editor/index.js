const springAuth = require('../../utils/springAuth.js');
const { mdToHtml, htmlToMd } = require('../../utils/markdown.js');

const TEMPLATES = {
  update: [
    { heading: '新增功能', items: ['', ''] },
    { heading: '优化改进', items: ['', ''] },
    { heading: '问题修复', items: ['', ''] },
  ],
  maintenance: [
    { heading: '维护时间', items: ['预计 YYYY/MM/DD HH:mm ~ HH:mm'] },
    { heading: '影响范围', items: ['维护期间小程序部分功能可能暂时不可用'] },
    { heading: '注意事项', items: ['', ''] },
  ],
  feature: [
    { heading: '功能介绍', items: ['', ''] },
    { heading: '如何使用', items: ['', '', ''] },
    { heading: '温馨提示', items: ['如有疑问请联系管理员'] },
  ],
  general: [{ heading: '', items: ['', '', ''] }],
};

const FREE_SNIPPETS = {
  h2: '## ',
  h3: '### ',
  bold: '**加粗文字**',
  ul: '- ',
  quote: '> ',
};

let sectionSeq = 0;

function nextSectionId() {
  sectionSeq += 1;
  return 'sec_' + sectionSeq + '_' + Date.now();
}

/** 为段落补稳定 id，供 wx:key 与 setData 校验使用 */
function withSectionMeta(sections) {
  return (sections || []).map(function (sec) {
    return {
      _id: sec._id || nextSectionId(),
      heading: sec.heading != null ? String(sec.heading) : '',
      items: Array.isArray(sec.items) && sec.items.length ? sec.items.map(function (x) { return x != null ? String(x) : ''; }) : [''],
    };
  });
}

function parseFieldValue(raw) {
  if (raw != null && typeof raw === 'object' && raw.value != null) return String(raw.value);
  return raw != null ? String(raw) : '';
}

/** 从 data-* 安全解析非负整数索引，非法时返回 -1 */
function parseDatasetIndex(raw) {
  if (raw == null || raw === '') return -1;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

function guessImageMeta(tempPath) {
  const p = String(tempPath || '').toLowerCase();
  const ts = Date.now();
  if (p.endsWith('.png')) return { fileName: 'editor_' + ts + '.png', mimeType: 'image/png' };
  if (p.endsWith('.webp')) return { fileName: 'editor_' + ts + '.webp', mimeType: 'image/webp' };
  if (p.endsWith('.gif')) return { fileName: 'editor_' + ts + '.gif', mimeType: 'image/gif' };
  return { fileName: 'editor_' + ts + '.jpg', mimeType: 'image/jpeg' };
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

function sectionsToMd(sections) {
  const lines = [];
  (sections || []).forEach(function (sec) {
    const h = (sec.heading || '').trim();
    if (h) lines.push('## ' + h);
    (sec.items || []).forEach(function (item) {
      const text = (item || '').trim();
      lines.push(text ? '- ' + text : '- ');
    });
    lines.push('');
  });
  return lines.join('\n').trim();
}

function mdToSections(md) {
  if (!md || typeof md !== 'string') return withSectionMeta([{ heading: '', items: [''] }]);
  const lines = md.split('\n');
  const sections = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^##\s+/.test(t)) {
      if (cur) sections.push(cur);
      cur = { heading: t.replace(/^##\s+/, '').trim(), items: [] };
      continue;
    }
    if (/^\-[\s-]?/.test(t)) {
      if (!cur) cur = { heading: '', items: [] };
      cur.items.push(t.replace(/^\-[\s-]?/, '').trim());
      continue;
    }
    if (!cur) cur = { heading: '', items: [] };
    cur.items.push(t);
  }
  if (cur) sections.push(cur);
  if (!sections.length) sections.push({ heading: '', items: [''] });
  sections.forEach(function (s) {
    if (!s.items.length) s.items.push('');
  });
  return withSectionMeta(sections);
}

function cloneSections(sections) {
  return withSectionMeta(JSON.parse(JSON.stringify(sections || [])));
}

Component({
  properties: {
    value: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
  },

  data: {
    formMode: true,
    sections: withSectionMeta([{ heading: '', items: [''] }]),
    freeMd: '',
    previewHtml: '',
    showPreview: false,
  },

  _emitTimer: null,
  _skipValueObserver: false,

  observers: {
    value: function (v) {
      if (this._skipValueObserver) return;
      const md = v != null ? String(v) : '';
      const currentMd = this.data.formMode ? sectionsToMd(this.data.sections) : (this.data.freeMd || '');
      if (md === currentMd) return;
      this.setData({
        sections: mdToSections(md),
        freeMd: md,
        showPreview: false,
      });
    },
  },

  lifetimes: {
    attached: function () {
      const v = this.properties.value || '';
      if (v) {
        this.setData({ sections: mdToSections(v), freeMd: v });
      }
    },
    detached: function () {
      if (this._emitTimer) {
        clearTimeout(this._emitTimer);
        this._emitTimer = null;
      }
    },
  },

  methods: {
    _parseIndices: function (e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      return {
        secIdx: parseDatasetIndex(ds.idx),
        itemIdx: parseDatasetIndex(ds.li),
      };
    },

    _safeSetSectionField: function (secIdx, field, value) {
      const sections = this.data.sections || [];
      if (secIdx < 0 || secIdx >= sections.length) return false;
      this.setData({ ['sections[' + secIdx + '].' + field]: value });
      return true;
    },

    _safeSetItemValue: function (secIdx, itemIdx, value) {
      const sections = this.data.sections || [];
      if (secIdx < 0 || secIdx >= sections.length) return false;
      const items = sections[secIdx] && sections[secIdx].items;
      if (!Array.isArray(items) || itemIdx < 0 || itemIdx >= items.length) return false;
      this.setData({ ['sections[' + secIdx + '].items[' + itemIdx + ']']: value });
      return true;
    },

    _scheduleEmit: function () {
      const self = this;
      if (self._emitTimer) clearTimeout(self._emitTimer);
      self._emitTimer = setTimeout(function () {
        self._emitTimer = null;
        self._emitNow();
      }, 300);
    },

    _emitNow: function () {
      if (this._emitTimer) {
        clearTimeout(this._emitTimer);
        this._emitTimer = null;
      }
      const md = this.data.formMode ? sectionsToMd(this.data.sections) : this.data.freeMd;
      this._skipValueObserver = true;
      this.triggerEvent('change', { value: mdToHtml(md), md: md });
      this._skipValueObserver = false;
    },

    _replaceSections: function (sections) {
      this.setData({ sections: cloneSections(sections), showPreview: false });
      this._emitNow();
    },

    switchToForm: function () {
      if (this.data.formMode) return;
      this.setData({ formMode: true, sections: mdToSections(this.data.freeMd), showPreview: false });
      this._emitNow();
    },

    switchToFree: function () {
      if (!this.data.formMode) return;
      const freeMd = sectionsToMd(this.data.sections);
      this.setData({ formMode: false, freeMd: freeMd, showPreview: false });
      this._emitNow();
    },

    onItemInput: function (e) {
      const idxs = this._parseIndices(e);
      const v = parseFieldValue(e.detail);
      if (!this._safeSetItemValue(idxs.secIdx, idxs.itemIdx, v)) return;
      this._scheduleEmit();
    },

    onSectionHeading: function (e) {
      const idxs = this._parseIndices(e);
      const v = parseFieldValue(e.detail);
      if (!this._safeSetSectionField(idxs.secIdx, 'heading', v)) return;
      this._scheduleEmit();
    },

    applyTemplate: function (e) {
      const key = e.currentTarget.dataset.key;
      const tpl = TEMPLATES[key];
      if (!tpl) return;
      this._replaceSections(tpl);
    },

    clearAll: function () {
      this._replaceSections([{ heading: '', items: [''] }]);
    },

    addItem: function (e) {
      const idxs = this._parseIndices(e);
      if (idxs.secIdx < 0) return;
      const sections = cloneSections(this.data.sections);
      if (idxs.secIdx >= sections.length) return;
      sections[idxs.secIdx].items = sections[idxs.secIdx].items.concat(['']);
      this._replaceSections(sections);
    },

    removeItem: function (e) {
      const idxs = this._parseIndices(e);
      if (idxs.secIdx < 0 || idxs.itemIdx < 0) return;
      const sections = cloneSections(this.data.sections);
      if (idxs.secIdx >= sections.length) return;
      const items = sections[idxs.secIdx].items.filter(function (_, j) { return j !== idxs.itemIdx; });
      sections[idxs.secIdx].items = items.length ? items : [''];
      this._replaceSections(sections);
    },

    addSection: function () {
      const sections = cloneSections(this.data.sections);
      sections.push({ heading: '', items: [''] });
      this._replaceSections(sections);
    },

    removeSection: function (e) {
      const idxs = this._parseIndices(e);
      if (idxs.secIdx < 0) return;
      const sections = cloneSections(this.data.sections).filter(function (_, i) { return i !== idxs.secIdx; });
      this._replaceSections(sections.length ? sections : [{ heading: '', items: [''] }]);
    },

    onFreeInput: function (e) {
      const freeMd = parseFieldValue(e.detail);
      this.setData({ freeMd: freeMd });
      this._scheduleEmit();
    },

    insertSnippet: function (e) {
      const key = e.currentTarget.dataset.key;
      const snippet = FREE_SNIPPETS[key];
      if (!snippet) return;
      const cur = this.data.freeMd || '';
      const freeMd = cur + (cur.length && !/\n$/.test(cur) ? '\n' : '') + snippet;
      this.setData({ freeMd: freeMd });
      this._emitNow();
    },

    insertImage: function () {
      const self = this;
      if (self.properties.disabled) return;
      const runUpload = async function (tempFilePath) {
        if (!tempFilePath) {
          wx.showToast({ title: '请先选择图片', icon: 'none' });
          return;
        }
        const meta = guessImageMeta(tempFilePath);
        wx.showLoading({ title: '上传中', mask: true });
        try {
          let url = await springAuth.uploadSpringFile(tempFilePath, meta);
          url = normalizeUploadedImageUrl(url);
          if (!url || !/^https?:\/\//i.test(url)) {
            throw new Error('上传成功但未得到可访问的图片地址');
          }
          if (self.data.formMode) {
            const sections = cloneSections(self.data.sections);
            const last = sections.length - 1;
            if (last >= 0) {
              sections[last].items = sections[last].items.concat(['![图片](' + url + ')']);
              self._replaceSections(sections);
            }
          } else {
            const cur = self.data.freeMd || '';
            const freeMd = cur + (cur.length && !/\n$/.test(cur) ? '\n' : '') + '![](' + url + ')\n';
            self.setData({ freeMd: freeMd });
            self._emitNow();
          }
          wx.showToast({ title: '已插入图片', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none', duration: 2800 });
        } finally {
          wx.hideLoading();
        }
      };
      if (typeof wx.chooseMedia === 'function') {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: function (r) {
            const f = r.tempFiles && r.tempFiles[0];
            void runUpload((f && f.tempFilePath) || '');
          },
          fail: function (err) {
            if (!/cancel|取消/i.test((err && err.errMsg) || '') && typeof wx.chooseImage === 'function') {
              wx.chooseImage({
                count: 1,
                sizeType: ['compressed'],
                sourceType: ['album', 'camera'],
                success: function (r2) {
                  void runUpload((r2.tempFilePaths && r2.tempFilePaths[0]) || '');
                },
              });
            }
          },
        });
      } else if (typeof wx.chooseImage === 'function') {
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: function (r) {
            void runUpload((r.tempFilePaths && r.tempFilePaths[0]) || '');
          },
        });
      }
    },

    onTogglePreview: function () {
      if (this.data.showPreview) {
        this.setData({ showPreview: false });
        return;
      }
      const md = this.data.formMode ? sectionsToMd(this.data.sections) : this.data.freeMd;
      this.setData({ showPreview: true, previewHtml: mdToHtml(md) });
    },
  },
});
