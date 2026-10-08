const aiChatStream = require('../../utils/aiChatStream.js');
const markdown = require('../../utils/markdown.js');
const springAuth = require('../../utils/springAuth.js');

/** 模型按工具给的路径原样写链接，路径本身是真的 */
const TPL_DOWNLOAD_RE = /\/api\/admin\/file-templates\/([^/\s)"']+)\/download/g;
/** 把这些下载链接写成 markdown 链接的样子：`[锚文本](/api/.../download)` */
const TPL_MD_LINK_RE = /\[([^\]]*)\]\(\/api\/admin\/file-templates\/[^/\s)"']+\/download\)/g;

/**
 * 从正文里挑出模板库下载链接。
 *
 * <p>Web 端是在富文本容器上挂 onClick 接管这些链接 —— 裸点会 401（那个下载口要 requireStaff，
 * 而 &lt;a&gt; 跳转不带 Authorization）。小程序的 rich-text **不响应链接点击、也没有事件委托**，
 * 所以换成把链接抽出来，在气泡下面单独渲染成按钮，走带 token 的请求。
 */
function extractDownloadLinks(text) {
  const out = [];
  const s = String(text || '');
  let m;
  TPL_DOWNLOAD_RE.lastIndex = 0;
  while ((m = TPL_DOWNLOAD_RE.exec(s)) !== null) {
    if (!out.some((x) => x.id === m[1])) out.push({ id: m[1], name: '' });
  }
  return out;
}

/**
 * 像不像 markdown —— 不像就不转，省得给纯文本套上一堆标签。
 * 与 Web 端 ChatMarkdownBody 同一个判断口径（它用的是 utils/markdownHtml 的 looksLikeMarkdown）。
 */
function looksLikeMarkdown(text) {
  const s = String(text || '');
  return (
    /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/.test(s) ||
    /\*\*[^*]+\*\*/.test(s) ||
    /`[^`]+`/.test(s) ||
    /\[[^\]]+\]\([^)]+\)/.test(s) ||
    /(^|\n)\s*(\|.+\||-{3,})/.test(s)
  );
}

/** 消息 key 自增：不用 index 当 key，追加时不会让已有节点复用错位 */
let seq = 0;
function nextKey() {
  seq += 1;
  return 'm' + Date.now().toString(36) + '_' + seq;
}

/** 最多带几张图 */
const MAX_IMAGES = 6;
/** 最多带几个表格/文本附件 */
const MAX_FILES = 3;
/**
 * 附件收哪些扩展名。与 Web 端同一套。
 * xlsx/xls 服务端解析成网格；md/txt 按文本读；pdf 抽文字层；docx 读段落与表格。
 * 别的（老式 .doc、图片型 PDF 之外的二进制格式）解析不了，拦在选文件这一步。
 */
const FILE_EXTS = ['xlsx', 'xls', 'md', 'txt', 'pdf', 'docx'];
/** 这些走 previewImage，其余交给 openDocument */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
/** 服务端拿 data URL 的 MIME 判类型，模板库下载回来的二进制要自己贴对 */
const MIME_BY_EXT = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  md: 'text/markdown',
  txt: 'text/plain',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

/** 对话缓存：刷新/重进小程序后恢复，超时即弃 */
const CACHE_KEY = 'ai-chat-cache';
const CACHE_TTL_MS = 15 * 60 * 1000;
/** 打字机每 70ms 改一次 messages，缓存写入要跟着限流 */
const CACHE_THROTTLE_MS = 1000;

/** 按扩展名推 MIME —— 服务端拿 data URL 的这部分判类型 */
function mimeOfPath(filePath) {
  const ext = String(filePath || '').split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/jpeg';
}

/** 毫秒 → 「12.4s」；超过 60s 换成「1 分 15 秒」 */
function fmtSec(ms) {
  if (!ms || ms < 0) return '';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  var total = Math.round(ms / 1000);
  return Math.floor(total / 60) + '分' + (total % 60) + '秒';
}

/**
 * 多问时把所有答案合成一条消息（每行「题目标题：答案」），模型据此逐条对应。
 * 只有一问时原样回那个值 —— 上下文已经说明在问什么，不必加壳。
 */
function composeAnswers(questions, answers) {
  if (questions.length <= 1) return answers[0] || '';
  return questions
    .map(function (q, i) {
      return (q.question || '第 ' + (i + 1) + ' 问') + '：' + (answers[i] || '');
    })
    .join('\n');
}

Component({
  properties: {
    /** 由宿主控制开合 */
    visible: {
      type: Boolean,
      value: false,
      observer(next) {
        if (next) this.handleOpened();
        else this.handleClosed();
      },
    },
  },

  data: {
    messages: [],
    draft: '',
    canSend: false,
    sending: false,
    /**
     * 待答问题队列。服务端的 interaction 事件**一道题来一次**（一条消息里可能问好几件
     * 事，如「张皓瀚缺房间、林安顺缺时长」），所以要多道攒着依次问，答满再合成一条发出。
     */
    queue: [],
    /** 已答的答案，下标与 queue 对应 */
    answers: [],
    /**
     * 向导指针：**在看哪一题**。和 answers 分开存 —— 合在一起就没法「上一题」回去改。
     * 只有一问时不用它（点一下即办）。
     */
    current: 0,
    /** 当前这道题的选项与已选值（WXML 里不能算 queue[i]，所以算好放出来） */
    currentOptions: [],
    currentAnswer: '',
    /** 当前这道题的问句（多选题时显示，好知道在问哪件事） */
    currentQuestion: '',
    queueTotal: 0,
    wizardMode: false,
    /** 当前这题是写操作确认：它只有执行/不执行，不配自定义回答与取消 */
    isConfirm: false,
    /** 已答几道，给「提交（2/3）」用 */
    answeredCount: 0,
    /** 每一题都答过才让按「提交」 */
    allAnswered: false,
    /** 自定义回答框常驻在选项下面，回车即选中这题 */
    customDraft: '',
    /**
     * 待发图片。**只存临时路径**（渲染用），不上 data —— 图片 base64 动辄几百 KB，
     * setData 有 1MB 上限，塞进来会直接报错。发送时才读成 data URL 传给接口。
     */
    images: [],
    /**
     * 待发附件（xlsx/xls/md/txt）。同样只存临时路径：它们的 base64 比图片还大。
     * 与图片不同的是，服务端会**解析并落库**，之后追问仍看得见这份文件。
     */
    files: [],
    /** 模板库选择弹窗 */
    tplOpen: false,
    tplLoading: false,
    tplList: [],
    /** 头部小球的动效节奏（表情轮换与待机动作由 ai-orb 自己管） */
    orbState: 'idle',
    statusText: '在线',
    scrollTarget: '',
    /** 服务端回传的会话 id，后续轮次接着这条聊 */
    sessionId: null,
    /** 历史对话列表视图：与消息区共用同一块位置，开列表就把对话收起来 */
    historyOpen: false,
    historyLoading: false,
    historyList: [],
  },

  observers: {
    messages() {
      this.saveCache();
    },
    sessionId() {
      this.saveCache();
    },
  },

  lifetimes: {
    attached() {
      // 非渲染态的实例字段在这里起手，省得处处判 undefined
      this.stream = null;
      this.scrollTimer = null;
      this.typerTimer = null;
      this.typeKey = null;
      this.typeFull = '';
      this.typeShown = 0;
      this.typeFinished = false;
      this.cacheSavedAt = 0;
      /** 下一轮是否开新会话（新建对话后置 true，发过一次即复位） */
      this.newSessionFlag = false;
      this.restoreCache();
      if (this.data.visible) this.handleOpened();
    },
    detached() {
      this.abortStream();
      this.stopTypewriter();
      if (this.scrollTimer) clearTimeout(this.scrollTimer);
    },
  },

  methods: {
    handleOpened() {
      // 只有第一次打开才主动问好；聊过再打开就接着原对话
      if (this.data.messages.length === 0) this.greet();
      this.scrollToEnd();
    },

    handleClosed() {
      this.abortStream();
      // 还没吐完的字落屏，下次打开是完整的一条而不是半句
      this.flushTypewriter();
      this.clearTyping();
    },

    // ── 新建 / 历史对话 ──────────────────────────────────────

    /** 新建对话：清空所有在途状态，并让下一轮开一条新会话 */
    onNewChat() {
      this.abortStream();
      this.stopTypewriter();
      this.typeKey = null;
      this.typeFull = '';
      this.typeShown = 0;
      this.typeFinished = false;
      this.newSessionFlag = true;
      this.setData({
        messages: [],
        draft: '',
        canSend: false,
        sending: false,
        orbState: 'idle',
        statusText: '在线',
        images: [],
        files: [],
        sessionId: null,
        historyOpen: false,
        historyList: [],
        ...this.clearedQueuePatch(),
      });
      this.clearCache();
      // 新会话照样先问好，别留一块空白 —— greet 那条请求才带环境提示词，
      // 服务端靠它把「你是谁、能干什么」的约束重新注进去（Web 端同此）
      this.greet();
    },

    onOpenHistory() {
      if (this.data.historyOpen) {
        this.setData({ historyOpen: false });
        return;
      }
      this.setData({ historyOpen: true, historyLoading: true, historyList: [] });
      aiChatStream
        .fetchSessions()
        .then((list) => this.setData({ historyList: list || [], historyLoading: false }))
        .catch(() => this.setData({ historyList: [], historyLoading: false }));
    },

    /** 切到某条历史会话：把它的消息铺成对话，并记住会话 id 让下一条接上去 */
    onPickSession(e) {
      const id = Number(e.currentTarget.dataset.id);
      if (!id) return;
      this.setData({ historyLoading: true });
      aiChatStream
        .fetchSessionMessages(id)
        .then((msgs) => {
          const list = (msgs || [])
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            // 工具轮 / 空答复不铺成气泡
            .filter((m) => String(m.content || '').trim().length > 0)
            .map((m) => {
              const text = String(m.content || '');
              const item = {
                key: nextKey(),
                role: m.role === 'user' ? 'user' : 'assistant',
                text: text,
              };
              // 历史里的助手答复同样可能带 markdown
              if (m.role !== 'user' && looksLikeMarkdown(text)) {
                item.html = markdown.mdToHtml(text);
              }
              return item;
            });
          this.newSessionFlag = false;
          this.setData({
            messages: list,
            historyOpen: false,
            historyLoading: false,
            sessionId: id,
            ...this.clearedQueuePatch(),
          });
          this.scrollToEnd();
        })
        .catch(() => this.setData({ historyLoading: false }));
    },

    // ── 对话缓存 ─────────────────────────────────────────────

    saveCache() {
      const now = Date.now();
      if (this.cacheSavedAt && now - this.cacheSavedAt < CACHE_THROTTLE_MS) return;
      this.cacheSavedAt = now;
      try {
        // 图片是本地临时路径（或几百 KB 的 data URL），存了没用还撑爆 storage
        const slim = this.data.messages.map((m) => ({
          key: m.key,
          role: m.role,
          text: m.text,
          meta: m.meta,
        }));
        wx.setStorageSync(CACHE_KEY, { ts: now, messages: slim, sessionId: this.data.sessionId });
      } catch (e) {
        /* ignore quota */
      }
    },

    restoreCache() {
      try {
        const raw = wx.getStorageSync(CACHE_KEY);
        if (!raw || !raw.ts) return;
        if (Date.now() - raw.ts > CACHE_TTL_MS) {
          wx.removeStorageSync(CACHE_KEY);
          return;
        }
        const list = (raw.messages || [])
          .filter((m) => m && String(m.text || '').trim())
          // 缓存里存的是纯文本，恢复时补一次 markdown 转换 ——
          // 否则刷新后原先渲染好的回复会退化成带 ** 的明文
          .map((m) => {
            if (m.role !== 'user' && !m.html && looksLikeMarkdown(m.text)) {
              m.html = markdown.mdToHtml(m.text);
            }
            // 恢复的回复同样要能下载它给的模板
            if (m.role !== 'user' && !m.links) {
              const links = extractDownloadLinks(m.text);
              if (links.length > 0) m.links = links;
            }
            return m;
          });
        if (list.length === 0) return;
        this.setData({ messages: list, sessionId: raw.sessionId || null });
      } catch (e) {
        /* ignore */
      }
    },

    clearCache() {
      this.cacheSavedAt = 0;
      try {
        wx.removeStorageSync(CACHE_KEY);
      } catch (e) {
        /* ignore */
      }
    },

    // ── 流式收发 ──────────────────────────────────────────────

    greet() {
      const botKey = nextKey();
      this.pushBotTurn(botKey);
      this.startStream(botKey, () => aiChatStream.streamGreet(this.handlersFor(botKey)));
    },

    submit(question, images, spreadsheets) {
      const pics = images || [];
      const docs = spreadsheets || [];
      const userKey = nextKey();
      const botKey = nextKey();
      this.setData({
        messages: this.data.messages.concat([
          {
            key: userKey,
            role: 'user',
            text: question,
            images: pics,
            // 只留文件名：附件本体是几百 KB 的 base64，进 messages 会被 setData 拒绝
            files: docs.map((d) => d.filename).filter((n) => !!n),
          },
          { key: botKey, role: 'assistant', text: '', pending: true, typing: true },
        ]),
        draft: '',
        canSend: false,
        ...this.clearedQueuePatch(),
      });
      this.startStream(botKey, () =>
        aiChatStream.streamAsk(question, this.handlersFor(botKey), {
          sessionId: this.data.sessionId,
          newSession: this.newSessionFlag,
          images: pics,
          spreadsheets: docs,
        }),
      );
      // 新会话只对紧接的这一轮生效，之后都续在这条会话上
      this.newSessionFlag = false;
    },

    /** 开一条流：统一置忙、注册回调、登记 abort */
    startStream(botKey, starter) {
      this.abortStream();
      this.setData({ sending: true, orbState: 'thinking', statusText: '正在思考…' });
      this.scrollToEnd();
      this.stream = starter();
    },

    handlersFor(botKey) {
      return {
        onDelta: (text) => this.appendText(botKey, text),
        onInteraction: (payload) => this.collectInteraction(payload),
        onDone: (payload) => {
          if (payload && typeof payload.sessionId === 'number' && payload.sessionId > 0) {
            this.setData({ sessionId: payload.sessionId });
          }
          // 标记源已结束：打字机把剩下的字吐完会自己停
          this.typeFinished = true;
          this.finishTurn(botKey, null, payload);
        },
        onError: (msg) => this.finishTurn(botKey, msg),
      };
    },

    pushBotTurn(botKey) {
      this.setData({
        messages: this.data.messages.concat([
          { key: botKey, role: 'assistant', text: '', pending: true, typing: true },
        ]),
        ...this.clearedQueuePatch(),
      });
    },

    // ── 待答问题队列 ──────────────────────────────────────────

    clearedQueuePatch() {
      return {
        queue: [],
        answers: [],
        current: 0,
        currentOptions: [],
        currentAnswer: '',
        queueTotal: 0,
        wizardMode: false,
        isConfirm: false,
        allAnswered: false,
        answeredCount: 0,
        currentQuestion: '',
        customDraft: '',
      };
    },

    collectInteraction(payload) {
      const options = (payload && payload.options) || [];
      if (options.length === 0) return;
      const queue = this.data.queue.concat([
        {
          question: payload.question,
          options: options,
          /** 写操作确认要用：token 是服务端那条挂起记录的凭证 */
          token: payload.token || '',
          /** confirm = 写操作确认，点一下就走，不进向导 */
          kind: payload.kind || '',
        },
      ]);
      const answers = [];
      this.setData({ queue: queue, answers: answers, current: 0 });
      this.syncWizard(queue, answers, 0);
    },

    /**
     * 把「当前题 / 已选值 / 是否可提交」算好落进 data —— WXML 里做不了这些推导。
     * 三个入参显式传进来，不读 this.data：调用方常常刚 setData 完就调它，
     * 而在自动化/批处理场景下 this.data 未必已经落地（踩过：指针算成了上一题）。
     */
    syncWizard(queue, answers, current) {
      const q = queue || this.data.queue;
      const a = answers || this.data.answers;
      const c0 = current == null ? this.data.current : current;
      const i = Math.min(c0, Math.max(q.length - 1, 0));
      const cur = q[i] || null;
      const answered = q.filter((_, k) => (a[k] || '').length > 0).length;
      this.setData({
        queueTotal: q.length,
        wizardMode: q.length > 1,
        isConfirm: !!cur && cur.kind === 'confirm',
        currentOptions: cur ? cur.options : [],
        currentQuestion: cur ? cur.question || '' : '',
        currentAnswer: a[i] || '',
        answeredCount: answered,
        allAnswered: q.length > 0 && answered === q.length,
      });
    },

    /**
     * 选一项。三条路分开，别混：
     *   写操作确认（kind=confirm）：点一下就走，回写到服务端那条挂起记录上；
     *   只有一问：点一下即办；
     *   多问：进向导，点选只高亮、可来回改，最后统一提交。
     */
    onChoiceTap(e) {
      if (this.data.sending) return;
      const value = String(e.currentTarget.dataset.value || '');
      if (!value) return;

      const q = this.data.queue[this.data.current];
      if (q && q.kind === 'confirm') {
        const chosen = (q.options.find((o) => o.value === value) || {}).label || value;
        this.submitInteraction(q.token, value, chosen);
        return;
      }
      if (!this.data.wizardMode) {
        this.submit(value);
        return;
      }
      const answers = this.data.answers.slice();
      answers[this.data.current] = value;
      const next = Math.min(this.data.current + 1, this.data.queue.length - 1);
      this.setData({ answers: answers, current: next, customDraft: '' });
      this.syncWizard(null, answers, next);
    },

    /**
     * 写操作确认：**不走 ask/stream**，回传选择值到服务端那条挂起记录上。
     * 当成新消息发出去，那条待办就成了孤儿 —— 用户点了确认，实际什么都没执行。
     * 用户那侧只留他点的那一下（label），不把内部选项值原样摆出来。
     */
    submitInteraction(token, value, label) {
      const sessionId = this.data.sessionId;
      if (!sessionId || !token || this.data.sending) {
        wx.showToast({ title: '会话已失效，请重新提问', icon: 'none' });
        return;
      }
      const userKey = nextKey();
      const botKey = nextKey();
      this.setData({
        messages: this.data.messages.concat([
          { key: userKey, role: 'user', text: label },
          { key: botKey, role: 'assistant', text: '', pending: true, typing: true },
        ]),
        draft: '',
        canSend: false,
        ...this.clearedQueuePatch(),
      });
      this.startStream(botKey, () =>
        aiChatStream.streamInteraction(sessionId, token, value, this.handlersFor(botKey)),
      );
    },

    gotoStep(next) {
      const max = Math.max(this.data.queue.length - 1, 0);
      const clamped = Math.min(Math.max(next, 0), max);
      if (clamped === this.data.current) return;
      this.setData({ current: clamped, customDraft: '' });
      this.syncWizard(null, null, clamped);
    },

    onPrev() {
      this.gotoStep(this.data.current - 1);
    },

    onNext() {
      this.gotoStep(this.data.current + 1);
    },

    /** 自定义回答框常驻在选项下面，不需要开关；回车即选中这题 */

    onCustomInput(e) {
      this.setData({ customDraft: (e.detail && e.detail.value) || '' });
    },

    /**
     * 自定义回答：**它就是选项下面那个常驻输入框**，回车即选中。
     * 多问时只落这一题的答案、**不自动跳题** —— 用户可能还要改字，跳走等于把输入框收了。
     */
    onCustomSubmit() {
      const text = (this.data.customDraft || '').trim();
      if (!text || this.data.sending) return;
      if (!this.data.wizardMode) {
        this.submit(text);
        return;
      }
      const answers = this.data.answers.slice();
      answers[this.data.current] = text;
      this.setData({ answers: answers });
      this.syncWizard(null, answers, this.data.current);
    },

    /** 向导提交：每道都答过才让按，整组合成一条消息发出去 */
    onSubmitAll() {
      if (!this.data.allAnswered || this.data.sending) return;
      const q = this.data.queue;
      const filled = q.map((_, i) => this.data.answers[i] || '');
      this.submit(composeAnswers(q, filled));
    },

    onCancelQueue() {
      this.setData(this.clearedQueuePatch());
    },

    // ── 打字机 ───────────────────────────────────────────────

    /**
     * 流式中每来一段先攒着，由打字机按字吐出去。
     *
     * 服务端不保证逐字推（实测常是一次性给完整段），直接落屏就是「卡几秒、整段蹦出来」。
     * Web 端的逐字也是前端打字机做的（useTypewriterText），这里照同一套来。
     * setData 是跨线程的，所以按 70ms 一拍推进，不要一个字一次。
     */
    appendText(botKey, text) {
      if (this.typeKey !== botKey) {
        // 上一轮还没吐完的字先落屏，否则被新的一轮噎掉、停在半句
        if (this.typeKey) this.flushTypewriter();
        this.typeKey = botKey;
        this.typeFull = '';
        this.typeShown = 0;
        this.typeFinished = false;
      }
      this.typeFull += text || '';
      if (!this.typerTimer) {
        this.typerTimer = setInterval(() => this.stepTypewriter(), 70);
      }
    },

    stepTypewriter() {
      const idx = this.indexOfKey(this.typeKey);
      if (idx < 0) {
        this.stopTypewriter();
        return;
      }
      const total = this.typeFull.length;
      this.typeShown = Math.min(total, this.typeShown + 3); // 3 字/70ms ≈ 43 字/秒
      const patch = {};
      patch['messages[' + idx + '].text'] = this.typeFull.slice(0, this.typeShown);
      patch['messages[' + idx + '].pending'] = false;
      this.setData(patch);
      this.scrollToEnd();
      if (this.typeShown >= total && this.typeFinished) {
        this.stopTypewriter();
        this.markdownize(idx);
      }
    },

    /**
     * 打完字才转 markdown —— 流式中途的文本是半截的，转出来结构是错的。
     * 与 Web 端一致：不像 markdown 就保持纯文本。
     */
    markdownize(idx) {
      const msg = this.data.messages[idx];
      if (!msg || msg.html) return;
      const text = msg.text || '';
      const links = extractDownloadLinks(text);
      const patch = {};

      /*
       * 正文里的下载链接抹成纯文本锚名：rich-text 点不了链接，留着就是给用户一个点了没反应的
       * 假入口；真正的入口是下面那排按钮。
       *
       * **要写回 text，不能只替换喂给 mdToHtml 的那一份** —— 抹平之后这段文字往往就没有
       * markdown 语法了，会走纯文本分支，而纯文本渲染的正是 text（踩过：按钮出来了，正文里
       * 却还挂着一长串 /api/... 的裸链接）。
       */
      const body = links.length > 0 ? text.replace(TPL_MD_LINK_RE, '$1') : text;
      if (body !== text) patch['messages[' + idx + '].text'] = body;
      if (looksLikeMarkdown(body)) patch['messages[' + idx + '].html'] = markdown.mdToHtml(body);
      if (links.length > 0) patch['messages[' + idx + '].links'] = links;
      if (Object.keys(patch).length) this.setData(patch);
    },

    /**
     * 下载模板：走带 token 的请求拿二进制，写临时文件后交给 wx 打开。
     * 小程序的富文本点不了链接，所以这一步是「下载」的唯一出口。
     *
     * <p>**按扩展名分流**：openDocument 只认文档（pdf/docx/xlsx/txt…），
     * 模板库里也有 png 这类图片，拿它开只会弹「打不开这个格式」—— 图片该走 previewImage。
     */
    onDownloadTemplate(e) {
      const id = e.currentTarget.dataset.id;
      const name = e.currentTarget.dataset.name || '下载';
      if (!id) return;
      wx.showLoading({ title: '下载中…', mask: true });
      springAuth
        .springRequestBinary('/api/admin/file-templates/' + encodeURIComponent(id) + '/download', {
          errorMessage: '下载失败',
          forbiddenMessage: '无权限下载',
        })
        .then((r) => {
          wx.hideLoading();
          const remote = springAuth.parseContentDispositionFilename(r.contentDisposition);
          const safe = String(remote || name || 'download').replace(/[\\/:*?"<>|]/g, '_');
          const path = wx.env.USER_DATA_PATH + '/tpl_' + Date.now() + '_' + safe.slice(0, 60);
          try {
            wx.getFileSystemManager().writeFileSync(path, r.data);
          } catch (err) {
            wx.showToast({ title: '文件写入失败', icon: 'none' });
            return;
          }
          const ext = (safe.split('.').pop() || '').toLowerCase();
          if (IMAGE_EXTS.indexOf(ext) >= 0) {
            // 图片走预览。**喂 base64 而不是文件路径** —— wx.env.USER_DATA_PATH 是 http://usr 形式，
            // previewImage 认的是 wxfile://，直接给路径会卡在「图片加载失败」。
            const mime = MIME_BY_EXT[ext] || 'image/png';
            const b64 = wx.arrayBufferToBase64(r.data);
            wx.previewImage({
              urls: ['data:' + mime + ';base64,' + b64],
              fail: () => wx.showToast({ title: '图片打不开', icon: 'none' }),
            });
            return;
          }
          wx.openDocument({
            filePath: path,
            showMenu: true, // 允许「用其他应用打开」/转发，等于给了保存出口
            fail: () => wx.showToast({ title: '打不开这个格式', icon: 'none' }),
          });
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '下载失败', icon: 'none' });
        });
    },

    stopTypewriter() {
      if (this.typerTimer) {
        clearInterval(this.typerTimer);
        this.typerTimer = null;
      }
    },

    /** 把还没吐完的字一次性落屏（关抽屉 / 组件销毁时用） */
    flushTypewriter() {
      this.stopTypewriter();
      const idx = this.indexOfKey(this.typeKey);
      if (idx < 0) return;
      const patch = {};
      patch['messages[' + idx + '].text'] = this.typeFull;
      patch['messages[' + idx + '].pending'] = false;
      this.setData(patch, () => this.markdownize(idx));
    },

    /** 收尾：errorText 非空表示这条是错误文案 */
    finishTurn(botKey, errorText, payload) {
      const idx = this.indexOfKey(botKey);
      const patch = {
        sending: false,
        orbState: 'idle',
        statusText: '在线',
        canSend: this.data.draft.trim().length > 0,
      };
      if (idx >= 0) {
        const msg = this.data.messages[idx];
        // 一个字都没收到还报错，就把错误写在气泡里，否则留空白气泡
        if (errorText && !msg.text) patch['messages[' + idx + '].text'] = errorText;
        patch['messages[' + idx + '].pending'] = false;
        patch['messages[' + idx + '].typing'] = false;
        const meta = this.metaTextOf(payload);
        if (meta) patch['messages[' + idx + '].meta'] = meta;
      }
      this.setData(patch);
      this.scrollToEnd();
    },

    /** 用量：与 Web 端同一个口径（latencyMs / totalTokens） */
    metaTextOf(payload) {
      if (!payload) return '';
      const parts = [];
      const sec = fmtSec(payload.latencyMs);
      if (sec) parts.push('用时 ' + sec);
      if (payload.totalTokens) parts.push(payload.totalTokens + ' tokens');
      return parts.join(' · ');
    },

    /** 关抽屉时把「思考中」的残留状态清掉，免得下次打开还转着 */
    clearTyping() {
      const list = this.data.messages;
      const idx = list.length - 1;
      const patch = { sending: false, orbState: 'idle', statusText: '在线' };
      if (idx >= 0 && list[idx].typing) {
        patch['messages[' + idx + '].typing'] = false;
        patch['messages[' + idx + '].pending'] = false;
      }
      this.setData(patch);
    },

    indexOfKey(key) {
      const list = this.data.messages;
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].key === key) return i;
      }
      return -1;
    },

    abortStream() {
      if (!this.stream) return;
      try {
        this.stream.abort();
      } catch (e) {
        /* ignore */
      }
      this.stream = null;
    },

    // ── 滚动 ─────────────────────────────────────────────────

    /**
     * 滚到底。scroll-into-view 设成同一个值不会二次触发，得先清空再设。
     * 流式期间每段都调一次太密，攒 80ms 一次。
     */
    scrollToEnd() {
      if (this.scrollTimer) return;
      this.scrollTimer = setTimeout(() => {
        this.scrollTimer = null;
        this.setData({ scrollTarget: '' }, () => {
          this.setData({ scrollTarget: 'ai-drawer-end' });
        });
      }, 80);
    },

    // ── 交互 ─────────────────────────────────────────────────

    onDraftInput(e) {
      const draft = (e.detail && e.detail.value) || '';
      // 不等 sending 结束才让发：有草稿就说明用户要说话，此时发送会先中止当前那条
      this.setData({ draft: draft, canSend: draft.trim().length > 0 });
    },

    onSend() {
      if (!this.data.canSend) return;
      const question = (this.data.draft || '').trim();
      const pics = this.data.images.slice();
      const docs = this.data.files.slice();
      // 只带附件、不打字也放行：「看看这份表」这类问法可能一个字都不打
      if (!question && pics.length === 0 && docs.length === 0) return;
      // 上一轮还在飞就先收掉（用户已经决定改说别的了）
      this.abortStream();
      // 预览先清掉，免得留着让人以为还在待发队列里
      this.setData({ images: [], files: [], sending: false });
      if (pics.length === 0 && docs.length === 0) {
        this.submit(question);
        return;
      }
      Promise.all([this.readAllAsDataUrl(pics), this.readAllFiles(docs)]).then(([dataUrls, spreadsheets]) => {
        const text = question || (spreadsheets.length > 0 ? '（见附件）' : '（见图片）');
        this.submit(text, dataUrls.filter((s) => !!s), spreadsheets.filter((f) => !!f.data));
      });
    },

    /** 停止：用户不想等了。已吐出的字落屏，别把半句丢掉 */
    onStop() {
      this.abortStream();
      this.flushTypewriter();
      const list = this.data.messages;
      const last = list[list.length - 1];
      if (last && last.role === 'assistant') this.finishTurn(last.key, null);
      this.setData({ sending: false, orbState: 'idle', statusText: '在线' });
    },

    // ── 图片 ─────────────────────────────────────────────────

    onPickImage() {
      if (this.data.sending) return;
      const remain = MAX_IMAGES - this.data.images.length;
      if (remain <= 0) {
        wx.showToast({ title: '最多 ' + MAX_IMAGES + ' 张', icon: 'none' });
        return;
      }
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const files = (res && res.tempFiles) || [];
          if (files.length === 0) return;
          const list = this.data.images.concat(
            files.map((f) => ({ path: f.tempFilePath })),
          );
          this.setData({ images: list.slice(0, MAX_IMAGES) });
        },
      });
    },

    onRemoveImage(e) {
      const url = e.currentTarget.dataset.url;
      this.setData({
        images: this.data.images.filter((i) => i.path !== url),
      });
    },

    // ── 附件（表格 / 文本）────────────────────────────────────

    /** 从聊天记录里选文件 —— 小程序没有文件管理器，chooseMessageFile 是唯一能拿到 xlsx 的入口 */
    onPickFile() {
      if (this.data.sending) return;
      const remain = MAX_FILES - this.data.files.length;
      if (remain <= 0) {
        wx.showToast({ title: '最多 ' + MAX_FILES + ' 个附件', icon: 'none' });
        return;
      }
      wx.showActionSheet({
        itemList: ['从模板库选择', '从微信聊天选择'],
        success: (res) => {
          if (res.tapIndex === 0) this.openTemplatePicker();
          else if (res.tapIndex === 1) this.chooseFromWechat();
        },
      });
    },

    /** 微信聊天里的文件 */
    chooseFromWechat() {
      const remain = MAX_FILES - this.data.files.length;
      wx.chooseMessageFile({
        count: remain,
        type: 'file',
        extension: FILE_EXTS,
        success: (res) => {
          const picked = (res && res.tempFiles) || [];
          if (picked.length === 0) return;
          const list = this.data.files.concat(
            picked.map((f) => ({ id: f.path, name: f.name, path: f.path })),
          );
          this.setData({ files: list.slice(0, MAX_FILES) });
        },
      });
    },

    // ── 模板库 ────────────────────────────────────────────────
    // 这段在主包重写了一份，没有复用 package-feature/utils/fileTemplatesApi.js ——
    // **主包不能引分包**，而抽屉是主包组件。

    openTemplatePicker() {
      this.setData({ tplOpen: true, tplLoading: true, tplList: [] });
      springAuth
        .springRequest({ url: '/api/admin/file-templates', method: 'GET', data: {} })
        .then((res) => {
          const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          const rows = (body && body.success && Array.isArray(body.data) ? body.data : [])
            .map((r) => {
              // 服务端字段是 originalName（不是 fileName）；扩展名从它取
              const name = String(r.originalName || '');
              const dot = name.lastIndexOf('.');
              return { id: r.id, name: name || '未命名文件', ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '' };
            })
            // 模板库里什么都可能有（实测第一个就是 png），只留服务端解析得了的那几种
            .filter((r) => r.id != null && FILE_EXTS.indexOf(r.ext) >= 0);
          this.setData({ tplList: rows, tplLoading: false });
        })
        .catch(() => this.setData({ tplList: [], tplLoading: false }));
    },

    onCloseTemplatePicker() {
      this.setData({ tplOpen: false });
    },

    /** 选中模板：拉二进制 → base64 → 直接进待发列表（不落临时文件，免得留垃圾） */
    onPickTemplate(e) {
      const id = e.currentTarget.dataset.id;
      const name = e.currentTarget.dataset.name || 'template';
      if (!id || this.data.sending) return;
      if (this.data.files.length >= MAX_FILES) {
        wx.showToast({ title: '最多 ' + MAX_FILES + ' 个附件', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '读取中…', mask: true });
      springAuth
        .springRequestBinary('/api/admin/file-templates/' + encodeURIComponent(id) + '/download', {
          errorMessage: '模板下载失败',
          forbiddenMessage: '无权限下载',
        })
        .then((r) => {
          wx.hideLoading();
          const b64 = wx.arrayBufferToBase64(r.data);
          const ext = name.indexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
          const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
          const item = {
            id: 'tpl:' + id,
            name: name,
            dataUrl: 'data:' + mime + ';base64,' + b64,
          };
          this.setData({ files: this.data.files.concat([item]).slice(0, MAX_FILES), tplOpen: false });
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '模板下载失败', icon: 'none' });
        });
    },

    onRemoveFile(e) {
      const id = e.currentTarget.dataset.id;
      this.setData({ files: this.data.files.filter((f) => f.id !== id) });
    },

    /** 附件读成 data URL 再随本轮请求发出（服务端解析落库，之后追问仍看得见） */
    readAllFiles(docs) {
      return Promise.all(
        docs.map((d) =>
          // 模板库来的已经带 dataUrl，聊天记录来的还要读文件
          d.dataUrl
            ? Promise.resolve({ filename: d.name, data: d.dataUrl })
            : this.readOneAsDataUrl(d.path).then((data) => ({ filename: d.name, data: data })),
        ),
      );
    },

    readAllAsDataUrl(pics) {
      return Promise.all(pics.map((p) => this.readOneAsDataUrl(p.path)));
    },

    /** 服务端 images 字段收的是 data URL，与 Web 端同格式 */
    readOneAsDataUrl(filePath) {
      return new Promise((resolve) => {
        wx.getFileSystemManager().readFile({
          filePath: filePath,
          encoding: 'base64',
          success: (res) => resolve('data:' + mimeOfPath(filePath) + ';base64,' + res.data),
          fail: () => resolve(''),
        });
      });
    },

    onClose() {
      this.triggerEvent('close');
    },

    onPopupClose() {
      this.triggerEvent('close');
    },
  },
});
