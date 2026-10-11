/**
 * ai-drawer-feedback —— AI 抽屉「详情」里的**反馈**半屏：表单（文字必填 + 选图 ≤6）+ 我的反馈列表。
 *
 * <p>结构照 export-config-sheet：`van-popup`（bottom，圆角）+ 头部固定 + 内容区独立滚动 + 吸底提交；
 * **任一时刻只有一个滚动容器**（头部/底部都在 scroll-view 外）。
 *
 * <p>接口（后端已实现、已单测，本组件是唯一调用方）：
 *   <ul>
 *     <li>提交：{@code POST /api/v1/ai/drawer/feedback}，body {@code {content, imageUrls[]}}，文字必填、图 ≤6；</li>
 *     <li>列表：{@code GET /api/v1/ai/drawer/feedback?page=&size=}（默认只看自己）；
 *         {@code &all=true} 才是全部 —— **仅 ≥超管**，非超管一律**不传** all（后端传 true 会直接拒，不是回落）；</li>
 *     <li>回复改状态：{@code POST /api/v1/ai/drawer/feedback/reply}，body {@code {id, replyContent, replyImageUrls[], status}}，
 *         {@code replyImageUrls} 可选（≤6 张本站图，仅超管回复区可见）；{@code status} 只允许 {@code PENDING}/{@code REPLIED}；**仅 ≥超管**。状态切「待处理」且回复框为空时
 *         直接提交空回复 + {@code PENDING}（走撤回，后端清空全部回复）；切「已回复」且回复框为空则先拦下提示。</li>
 *   </ul>
 *
 * <p>列表行里的官方回复是**回复串**（{@code replies} 数组，按时间升序，元素 {@code {content, imageUrls[], repliedBy, repliedByName, repliedAt}}）；
 * 展示作者走 {@code repliedByName}（后端解析出的名字），拿不到再退回 {@code repliedBy}；
 * 旧的 {@code replyContent}/{@code replyImageUrls} 只作兼容读，**展示一律走 replies**。
 *
 * <p>文案走 aiCopy（后端可配、取不到回落兜底）；身份判据用 aiDrawerAdmin.isAdmin()（≥SUPER_ADMIN）。
 */
const springAuth = require('../../utils/springAuth.js');
const aiCopy = require('../../utils/aiCopy.js');
const aiDrawerAdmin = require('../../utils/aiDrawerAdmin.js');
const media = require('../../utils/aiFeedbackMedia.js');

const FEEDBACK_URL = '/api/v1/ai/drawer/feedback';
const REPLY_URL = '/api/v1/ai/drawer/feedback/reply';
const PAGE_SIZE = 20;

/** 界面兜底原文，与登记进 AiDrawerCopySeed 的默认值逐字一致。 */
const FALLBACK = {
  OPEN: '我要反馈',
  TITLE: '反馈',
  CLOSE: '关闭',
  FORM_TITLE: '写下你的意见',
  CONTENT_PH: '说说遇到的问题或建议（必填）',
  IMAGE_HINT: '最多 6 张（可选）',
  IMAGE_LIMIT: '最多 6 张',
  SUBMIT: '提交',
  SUBMITTING: '提交中…',
  SUBMIT_DONE: '已提交，谢谢你的反馈',
  SUBMIT_FAIL: '提交失败',
  EMPTY: '还没有反馈',
  LOAD_FAIL: '列表没拉取到，稍后再试',
  LIST_TITLE: '反馈记录',
  MINE: '我的',
  ALL: '全部',
  PENDING: '待处理',
  REPLIED: '已回复',
  REPLY_LABEL: '官方回复',
  REPLY_PH: '写回复…',
  REPLY: '回复',
  END: '没有更多了',
  REPLY_NEEDED: '先写回复内容',
  REPLY_DONE: '已回复',
  REPLY_FAIL: '回复失败',
  REPLY_IMAGE_HINT: '回复附图（可选）',
  LOADING: '加载中…',
  IMAGE_FAIL: '图片上传失败',
};

/** 一次 settle 全部 ai.copy.feedback.* 文案，界面上直接绑 data。 */
function copyBundle() {
  return {
    openText: aiCopy.copy('ai.copy.feedback.open', FALLBACK.OPEN),
    titleText: aiCopy.copy('ai.copy.feedback.title', FALLBACK.TITLE),
    closeText: aiCopy.copy('ai.copy.feedback.close', FALLBACK.CLOSE),
    formTitleText: aiCopy.copy('ai.copy.feedback.formTitle', FALLBACK.FORM_TITLE),
    contentPh: aiCopy.copy('ai.copy.feedback.contentPlaceholder', FALLBACK.CONTENT_PH),
    imgHintText: aiCopy.copy('ai.copy.feedback.imageHint', FALLBACK.IMAGE_HINT),
    imageLimitText: aiCopy.copy('ai.copy.feedback.imageLimit', FALLBACK.IMAGE_LIMIT),
    imageFailText: aiCopy.copy('ai.copy.feedback.imageFail', FALLBACK.IMAGE_FAIL),
    submitText: aiCopy.copy('ai.copy.feedback.submit', FALLBACK.SUBMIT),
    submittingText: aiCopy.copy('ai.copy.feedback.submitting', FALLBACK.SUBMITTING),
    submitDoneText: aiCopy.copy('ai.copy.feedback.submitDone', FALLBACK.SUBMIT_DONE),
    submitFailText: aiCopy.copy('ai.copy.feedback.submitFail', FALLBACK.SUBMIT_FAIL),
    emptyText: aiCopy.copy('ai.copy.feedback.empty', FALLBACK.EMPTY),
    loadFailText: aiCopy.copy('ai.copy.feedback.loadFail', FALLBACK.LOAD_FAIL),
    listTitleText: aiCopy.copy('ai.copy.feedback.listTitle', FALLBACK.LIST_TITLE),
    mineText: aiCopy.copy('ai.copy.feedback.mine', FALLBACK.MINE),
    allText: aiCopy.copy('ai.copy.feedback.all', FALLBACK.ALL),
    pendingText: aiCopy.copy('ai.copy.feedback.pending', FALLBACK.PENDING),
    repliedText: aiCopy.copy('ai.copy.feedback.replied', FALLBACK.REPLIED),
    replyLabelText: aiCopy.copy('ai.copy.feedback.replyLabel', FALLBACK.REPLY_LABEL),
    replyPhText: aiCopy.copy('ai.copy.feedback.replyPlaceholder', FALLBACK.REPLY_PH),
    replyText: aiCopy.copy('ai.copy.feedback.reply', FALLBACK.REPLY),
    endText: aiCopy.copy('ai.copy.feedback.end', FALLBACK.END),
    replyNeededText: aiCopy.copy('ai.copy.feedback.replyNeeded', FALLBACK.REPLY_NEEDED),
    replyDoneText: aiCopy.copy('ai.copy.feedback.replyDone', FALLBACK.REPLY_DONE),
    replyFailText: aiCopy.copy('ai.copy.feedback.replyFail', FALLBACK.REPLY_FAIL),
    replyImgHintText: aiCopy.copy('ai.copy.feedback.replyImageHint', FALLBACK.REPLY_IMAGE_HINT),
    loadingText: aiCopy.copy('ai.copy.feedback.loading', FALLBACK.LOADING),
  };
}

/** 时间升序：按各自时间字段比字符串（'YYYY-MM-DD HH:mm:ss' 字典序即时间序）。 */
function cmpTimeAsc(a, b) {
  const x = a == null ? '' : String(a);
  const y = b == null ? '' : String(b);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

/**
 * 归一化回复串：只认数组；逐条丢空值/非法项（非对象、既无文字又无图）；缺字段给空数组；**绝不抛**。
 * 每项补一个稳定 key（排序后的序位）供列表 wx:key。
 */
function normalizeReplies(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== 'object') continue;
    const content = r.content == null ? '' : String(r.content);
    const imageUrls = Array.isArray(r.imageUrls) ? r.imageUrls.filter(Boolean).map(String) : [];
    if (content.trim() === '' && imageUrls.length === 0) continue;
    const repliedBy = r.repliedBy == null ? '' : String(r.repliedBy);
    // 作者展示名：优先后端解析出的 repliedByName，拿不到再退回原始 id
    const byName = r.repliedByName == null ? '' : String(r.repliedByName).trim();
    out.push({
      content: content,
      imageUrls: imageUrls,
      repliedBy: repliedBy,
      repliedByName: byName !== '' ? byName : repliedBy,
      repliedAt: r.repliedAt == null ? '' : String(r.repliedAt),
    });
  }
  out.sort((a, b) => cmpTimeAsc(a.repliedAt, b.repliedAt));
  return out.map((rep, i) => ({ key: i, content: rep.content, imageUrls: rep.imageUrls, repliedBy: rep.repliedBy, repliedByName: rep.repliedByName, repliedAt: rep.repliedAt }));
}

/** 一行的可渲染形状：补上本地的回复草稿与待提交状态（默认沿用该条当前状态）。 */
function mapRow(r) {
  const src = r || {};
  const status = src.status === 'REPLIED' ? 'REPLIED' : 'PENDING';
  return {
    id: src.id,
    userName: src.userName == null ? '' : String(src.userName),
    content: src.content == null ? '' : String(src.content),
    imageUrls: Array.isArray(src.imageUrls) ? src.imageUrls.filter(Boolean) : [],
    status: status,
    replies: normalizeReplies(src.replies),
    createdAt: src.createdAt == null ? '' : String(src.createdAt),
    replyDraft: '',
    replyImages: [],
    replyStatus: status,
  };
}

function parseBody(res) {
  try {
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } catch (e) {
    return null;
  }
}

function failMessage(prefix, err) {
  const reason = err && err.message ? String(err.message) : '';
  return reason ? prefix + '：' + reason : prefix;
}

function indexOf(e) {
  const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
  const i = parseInt(ds.index, 10);
  return isNaN(i) ? -1 : i;
}

Component({
  properties: {
    /** 由宿主控制开合 */
    show: { type: Boolean, value: false },
  },

  data: {
    isAdmin: false,
    scope: 'mine', // 'mine' | 'all'（仅超管会切到 all）
    page: 0,
    size: PAGE_SIZE,
    list: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    finished: false,
    // —— 表单 ——
    content: '',
    canSubmit: false, // 文字非空才可提交（空则按钮灰、点了也不发）
    submitting: false,
    images: [],
    maxImages: media.MAX_IMAGE_COUNT,
    // —— 文案（兜底；loadCopy 后覆盖）——
    openText: FALLBACK.OPEN,
    titleText: FALLBACK.TITLE,
    closeText: FALLBACK.CLOSE,
    formTitleText: FALLBACK.FORM_TITLE,
    contentPh: FALLBACK.CONTENT_PH,
    imgHintText: FALLBACK.IMAGE_HINT,
    imageLimitText: FALLBACK.IMAGE_LIMIT,
    imageFailText: FALLBACK.IMAGE_FAIL,
    submitText: FALLBACK.SUBMIT,
    submittingText: FALLBACK.SUBMITTING,
    submitDoneText: FALLBACK.SUBMIT_DONE,
    submitFailText: FALLBACK.SUBMIT_FAIL,
    emptyText: FALLBACK.EMPTY,
    loadFailText: FALLBACK.LOAD_FAIL,
    listTitleText: FALLBACK.LIST_TITLE,
    mineText: FALLBACK.MINE,
    allText: FALLBACK.ALL,
    pendingText: FALLBACK.PENDING,
    repliedText: FALLBACK.REPLIED,
    replyLabelText: FALLBACK.REPLY_LABEL,
    replyPhText: FALLBACK.REPLY_PH,
    replyText: FALLBACK.REPLY,
    endText: FALLBACK.END,
    replyNeededText: FALLBACK.REPLY_NEEDED,
    replyDoneText: FALLBACK.REPLY_DONE,
    replyFailText: FALLBACK.REPLY_FAIL,
    replyImgHintText: FALLBACK.REPLY_IMAGE_HINT,
    loadingText: FALLBACK.LOADING,
  },

  observers: {
    // 每次打开：判一次超管身份、刷一次文案、从第一页重拉列表（**不动已填的表单**）
    show(v) {
      if (!v) return;
      const self = this;
      this.setData({ isAdmin: aiDrawerAdmin.isAdmin(), submitting: false });
      aiCopy.loadCopy().then(() => {
        self.setData(copyBundle());
        self.loadList({ reset: true });
      });
    },
  },

  methods: {
    /**
     * 拉一页列表。{@code append} = 触底追加（拼在后面，**不清空已展示的、不动表单**）；
     * 否则从第一页重置。非超管**永不**带 all 参数。
     */
    loadList(opts) {
      const o = opts || {};
      const append = !!o.append;
      if (this.data.loading || this.data.loadingMore) return;
      if (append && !this.data.hasMore) return;
      const nextPage = append ? this.data.page + 1 : 0;
      this.setData(append ? { loadingMore: true } : { loading: true });
      const data = { page: nextPage, size: this.data.size };
      // 只有超管切到「全部」才带 all=true；非超管这条分支永远进不来
      if (this.data.isAdmin && this.data.scope === 'all') data.all = true;
      const self = this;
      return springAuth
        .springRequest({ url: FEEDBACK_URL, method: 'GET', data: data })
        .then((res) => {
          const body = parseBody(res);
          if (!body || body.success !== true) {
            throw new Error((body && body.message) || self.data.loadFailText);
          }
          const payload = body.data || {};
          const rows = Array.isArray(payload.list) ? payload.list : [];
          const total = Number(payload.total || 0);
          const mapped = rows.map(mapRow);
          const list = append ? self.data.list.concat(mapped) : mapped;
          const hasMore = list.length < total;
          self.setData({
            list: list,
            page: nextPage,
            hasMore: hasMore,
            finished: !hasMore && list.length > 0,
            loading: false,
            loadingMore: false,
          });
        })
        .catch((err) => {
          self.setData({ loading: false, loadingMore: false });
          self._toast(failMessage(self.data.loadFailText, err), 'none');
        });
    },

    /** 触底追加下一页。 */
    onReachBottom() {
      if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
      return this.loadList({ append: true });
    },

    /** 超管：我的 / 全部 切换（非超管没有这颗按钮，进来也一律吞掉）。 */
    onSwitchScope(e) {
      if (!this.data.isAdmin) return;
      const scope = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.scope) || 'mine';
      const next = scope === 'all' ? 'all' : 'mine';
      if (next === this.data.scope) return;
      this.setData({ scope: next });
      this.loadList({ reset: true });
    },

    // ── 表单 ──────────────────────────────────────────────

    onContentInput(e) {
      const value = (e && e.detail && e.detail.value) || '';
      this.setData({ content: value, canSubmit: String(value).trim().length > 0 });
    },

    /** 选图（追加，上限 6）。到顶就不起选图口，只提示。 */
    onChooseImage() {
      if (this.data.images.length >= this.data.maxImages) {
        this._toast(this.data.imageLimitText, 'none');
        return Promise.resolve();
      }
      const self = this;
      return media
        .appendImages(this.data.images, this.data.maxImages)
        .then((next) => self.setData({ images: next }))
        .catch((err) => self._toast(failMessage(self.data.imageFailText, err), 'none'));
    },

    onRemoveImage(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.images.length) return;
      const images = this.data.images.slice();
      images.splice(i, 1);
      this.setData({ images: images });
    },

    onPreviewFormImage(e) {
      const url = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url) || '';
      if (!url) return;
      wx.previewImage({ current: url, urls: this.data.images.filter(Boolean) });
    },

    onPreviewRowImage(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      const url = ds.url || '';
      const i = parseInt(ds.index, 10);
      const row = !isNaN(i) ? this.data.list[i] : null;
      if (!url || !row) return;
      wx.previewImage({ current: url, urls: (row.imageUrls || []).filter(Boolean) });
    },

    /**
     * 提交反馈。**空文字直接返回、不发请求**（按钮同时置灰）；提交中禁重复。
     * 失败**如实提示并保留内容与图片**（绝不看起来像成功）。
     */
    onSubmit() {
      if (this.data.submitting) return;
      const text = String(this.data.content || '').trim();
      if (!text) return;
      this.setData({ submitting: true });
      const payload = { content: text, imageUrls: this.data.images.slice(0, this.data.maxImages) };
      const self = this;
      return springAuth
        .springRequest({ url: FEEDBACK_URL, method: 'POST', data: payload })
        .then((res) => {
          const body = parseBody(res);
          if (!body || body.success !== true) {
            throw new Error((body && body.message) || self.data.submitFailText);
          }
          self.setData({ submitting: false, content: '', images: [], canSubmit: false });
          self._toast(self.data.submitDoneText, 'success');
          self.loadList({ reset: true });
        })
        .catch((err) => {
          // 失败：内容与图片原样留着，好让人改完再传
          self.setData({ submitting: false });
          self._toast(failMessage(self.data.submitFailText, err), 'none');
        });
    },

    // ── 超管：回复 / 改状态 ────────────────────────────────

    onReplyInput(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.list.length) return;
      this.setData({ ['list[' + i + '].replyDraft']: (e && e.detail && e.detail.value) || '' });
    },

    /** 在「待处理 / 已回复」之间切（只改本地待提交状态，不发请求；随「回复」一起提交）。 */
    onToggleStatus(e) {
      if (!this.data.isAdmin) return;
      const i = indexOf(e);
      if (i < 0 || i >= this.data.list.length) return;
      const next = this.data.list[i].replyStatus === 'REPLIED' ? 'PENDING' : 'REPLIED';
      this.setData({ ['list[' + i + '].replyStatus']: next });
    },

    /** 超管回复区选图（追加，上限 6）。非超管一律吞掉（没有这颗入口）。 */
    onReplyChooseImage(e) {
      if (!this.data.isAdmin) return Promise.resolve();
      const i = indexOf(e);
      const row = this.data.list[i];
      if (!row) return Promise.resolve();
      const current = Array.isArray(row.replyImages) ? row.replyImages : [];
      if (current.length >= this.data.maxImages) {
        this._toast(this.data.imageLimitText, 'none');
        return Promise.resolve();
      }
      const self = this;
      return media
        .appendImages(current, this.data.maxImages)
        .then((next) => self.setData({ ['list[' + i + '].replyImages']: next }))
        .catch((err) => self._toast(failMessage(self.data.imageFailText, err), 'none'));
    },

    /** 删掉回复区草稿里第 img 张（dataset.index=行、dataset.img=图序）。 */
    onReplyRemoveImage(e) {
      if (!this.data.isAdmin) return;
      const i = indexOf(e);
      const row = this.data.list[i];
      const img = parseInt((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.img), 10);
      if (!row || isNaN(img)) return;
      const images = (Array.isArray(row.replyImages) ? row.replyImages : []).slice();
      if (img < 0 || img >= images.length) return;
      images.splice(img, 1);
      this.setData({ ['list[' + i + '].replyImages']: images });
    },

    /** 看回复草稿的大图。 */
    onPreviewDraftReplyImage(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      const url = ds.url || '';
      const i = parseInt(ds.index, 10);
      const row = !isNaN(i) ? this.data.list[i] : null;
      if (!url || !row) return;
      wx.previewImage({ current: url, urls: (row.replyImages || []).filter(Boolean) });
    },

    /** 看已落库的某条官方回复附图大图（dataset.index=行、dataset.ri=回复序、dataset.url=图）。 */
    onPreviewReplyImage(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      const url = ds.url || '';
      const i = parseInt(ds.index, 10);
      const ri = parseInt(ds.ri, 10);
      const row = !isNaN(i) ? this.data.list[i] : null;
      const rep = row && !isNaN(ri) ? (row.replies || [])[ri] : null;
      if (!url || !rep) return;
      wx.previewImage({ current: url, urls: (rep.imageUrls || []).filter(Boolean) });
    },

    /**
     * 回复并提交。status 只会是 PENDING / REPLIED：
     *   · 填了内容 → 直接提交（附带回复附图，≤6）；
     *   · 没填内容 + 状态「待处理」→ 提交空回复（= 撤回，后端清空回复三字段与回复附图，故附图带空数组）；
     *   · 没填内容 + 状态「已回复」→ 提示「先写回复内容」，不发请求。
     */
    onReply(e) {
      if (!this.data.isAdmin || this.data.submitting) return;
      const i = indexOf(e);
      const row = this.data.list[i];
      if (!row) return;
      const status = row.replyStatus === 'REPLIED' ? 'REPLIED' : 'PENDING';
      const text = String(row.replyDraft || '').trim();
      if (!text && status === 'REPLIED') {
        this._toast(this.data.replyNeededText, 'none');
        return;
      }
      this.setData({ submitting: true });
      // 有内容才带附图；空内容=撤回，附图必须带空数组（后端撤回会一并清空）
      const replyImageUrls = text ? (row.replyImages || []).slice(0, this.data.maxImages) : [];
      const self = this;
      return springAuth
        .springRequest({
          url: REPLY_URL,
          method: 'POST',
          data: { id: row.id, replyContent: text, replyImageUrls: replyImageUrls, status: status },
        })
        .then((res) => {
          const body = parseBody(res);
          if (!body || body.success !== true) {
            throw new Error((body && body.message) || self.data.replyFailText);
          }
          self.setData({ submitting: false });
          self._toast(self.data.replyDoneText, 'success');
          self.loadList({ reset: true });
        })
        .catch((err) => {
          self.setData({ submitting: false });
          self._toast(failMessage(self.data.replyFailText, err), 'none');
        });
    },

    onClose() {
      if (this.data.submitting) return;
      this.triggerEvent('close');
    },

    _toast(title, icon) {
      try {
        wx.showToast({ title: title, icon: icon || 'none' });
      } catch (e) {
        /* 提示失败不影响主流程 */
      }
    },

    /** 吃掉面板空白处的 touchmove，挡住穿透滚动。 */
    noop() {},
  },
});
