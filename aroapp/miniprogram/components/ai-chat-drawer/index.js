const aiChatStream = require('../../utils/aiChatStream.js');
const markdown = require('../../utils/markdown.js');
const springAuth = require('../../utils/springAuth.js');
const pagePermission = require('../../utils/pagePermission.js');

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

/**
 * 有没有登录态。
 *
 * <p>token 和身份信息**两个都要有**：只有 token 时问话也是白问 —— 服务端认得出人，
 * 但页面上的身份判断（学生/教职工视角、可办的页面）都拿不到，助手会一路答错或报错。
 * 退登录或从没登录过时，助手整体不可用。
 */
function hasSession() {
  try {
    return !!wx.getStorageSync(springAuth.KEYS.TOKEN) && !!wx.getStorageSync(springAuth.KEYS.USER_INFO);
  } catch (e) {
    return false;
  }
}

/** 对话缓存：刷新/重进小程序后恢复，超时即弃 */
const CACHE_KEY_PREFIX = 'ai-chat-cache';
/** 早先那个**不分账号**的键。留着会被下一个人读到 —— 见到就顺手清掉。 */
const LEGACY_CACHE_KEY = 'ai-chat-cache';
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * 当前账号的缓存键。
 *
 * <p>**必须按账号分**：存储是按机器共享的，同一个微信换个人登录（或用别人的手机），
 * 抽屉会把上一个人的对话读出来显示给他 —— 那不只是体验问题，是**把别人的对话内容泄给下一个人**。
 * 网页端早就按账号分了（真机确认过：单一 key 里存着别人的 44 条问答，连用户标识都没有），
 * 小程序这边是同一台机器、同一个源，风险一模一样。
 */
function currentCacheKey() {
  var info = null;
  try {
    info = JSON.parse(wx.getStorageSync('springUserInfo') || 'null');
  } catch (e) {
    info = null;
  }
  var uid = info && (info.id || info.userId);
  // 没登录时退到一个不落地的占位，不会和任何真实账号撞上
  return CACHE_KEY_PREFIX + ':' + (uid || 'anon');
}

/** 清掉别的账号留在这台机器上的对话缓存（含旧的那个不分账号的键）。 */
function purgeForeignCaches() {
  var keep = currentCacheKey();
  try {
    var keys = (wx.getStorageInfoSync() || {}).keys || [];
    keys.forEach(function (k) {
      if (k === LEGACY_CACHE_KEY || (k.indexOf(CACHE_KEY_PREFIX + ':') === 0 && k !== keep)) {
        wx.removeStorageSync(k);
      }
    });
  } catch (e) {
    /* 读不到存储列表就跳过，不影响主流程 */
  }
}
/** 打字机每 70ms 改一次 messages，缓存写入要跟着限流 */
const CACHE_THROTTLE_MS = 1000;

/**
 * 哪些工具值得在对话里露出「正在做…」。
 *
 * <p>**只登记长任务**：这类要等好几秒、还可能失败，用户需要知道进度（不然就是在干等，
 * 或者干脆以为它失败了）。其余工具都是毫秒级的读，抖出来只会让每条回答下面都堆一行噪声。
 */
const TOOL_BUSY_LABEL = {
  screenshotPage: '正在截图',
  scheduleTimers: '正在设定时',
};

/** 还在跑的状态（要每秒走倒计时、到点要补拉结果）。 */
const TIMER_LIVE_STATUSES = ['PENDING', 'FIRING', 'AWAITING_CONFIRM'];

/** 剩余时间 mm:ss（超过一小时给 h:mm:ss）。 */
function fmtRemain(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}

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
    /** 当前这道题是不是多选（勾完点「确认」才提交，而不是点一下即办） */
    currentMulti: false,
    /** 多选题已勾的值（多选才用；单选走 currentAnswer） */
    multiPick: [],
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
    /** 流式期间的实时态（「思考中 3.2s · 1.2k tokens」），答完清空 */
    liveMeta: '',
    scrollTarget: '',
    /** 倒计时每秒重算的文案（id -> '还剩 00:31'），wxml 按 id 取 */
    timerTicks: {},
    /** 助手算好的那份导出（有就渲染成一张下载卡，用户点一下才真去取文件） */
    downloadCard: null,
    downloadBusy: false,
    /** 服务端回传的会话 id，后续轮次接着这条聊 */
    sessionId: null,
    /** 当前对话的标题（抽屉顶部显示一句，让人知道自己在哪条对话里） */
    sessionTitle: '',
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
      /** 节流窗口内排下的那次补写（尾触发）。见 saveCache 的注释。 */
      this.cachePending = null;
      /** 服务端时间 − 本地时间：倒计时要补这个差，机器时钟偏几分钟才不会显示成「早该到了」 */
      this.timerSkewMs = 0;
      /** 归零后补拉结果的记账（每 5 秒一次、最多 24 次） */
      this.timerPoll = {};
      /**
       * **刚刚收尾的那条消息**的 key —— 倒计时/产物的唯一落点。
       *
       * <p>为什么这是本质正确的：服务端给的锚是「工具调用那条消息」的 id，而这里是「最终回复那条」，
       * 两者不是一回事；中间还夹着一次挂起（正文为空、抽屉故意不画）。拿两边的 id 对齐怎么都会错。
       * 「刚收尾的是哪一条」**只有载体自己知道**，收尾那一刻记下来即可。
       */
      this.lastFinalizedKey = null;
      /** 上一轮看到的每个倒计时的状态（用来发现「刚从在跑变成终态」那一刻）。 */
      this.timerSeenStatus = {};
      this.timerTickHandle = null;
      /** 下一轮是否开新会话（新建对话后置 true，发过一次即复位） */
      this.newSessionFlag = false;
      // 先清掉别的账号留在这台机器上的对话（含旧的不分账号那个键），再恢复自己的
      purgeForeignCaches();
      this.restoreCache();
      if (this.data.visible) this.handleOpened();
    },
    detached() {
      this.abortStream();
      this.stopTypewriter();
      if (this.scrollTimer) clearTimeout(this.scrollTimer);
      if (this.cachePending) clearTimeout(this.cachePending);
      if (this.timerTickHandle) clearInterval(this.timerTickHandle);
    },
  },

  methods: {
    handleOpened() {
      // **没登录就别开**：助手要靠会话身份才能办事（所有请求都带 token），开着只会一路报错。
      // 关掉并说明原因 —— 按钮点了没反应比报错更让人困惑。
      if (!hasSession()) {
        wx.showToast({ title: '请先登录后再使用助手', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      // 每次打开都清一遍别的账号留下的对话（含旧的不分账号那个键）。
      // 放这里而不是 attached：小程序热重载/切页不一定会重跑 attached，这里一定会跑到。
      purgeForeignCaches();
      // 倒计时挂回来（缓存里那份状态早就过期了，重新拉一次才算数）
      this.mountTimers();
      // 抽屉关着的那段时间，定时器可能已经执行完并往会话里写了汇报 ——
      // 那时跳秒定时器早停了，没人拉。这里补一次，否则卡片显示「已完成」而对话里看不到那条回复。
      this.pullNewMessages();
      // 只有第一次打开才主动问好；聊过再打开就接着原对话
      if (this.data.messages.length === 0) {
        this.restoreLatestSession();
        return;
      }
      this.scrollToEnd();
    },

    /**
     * 本机没缓存时：**去服务端拉最近一条对话接着聊**，拉不到才问好。
     *
     * <p>为什么不直接问好：缓存有 15 分钟 TTL（还有换设备、清缓存的情形），过期后打开只剩一句问候，
     * 用户看到的是「刚才那些回答全没了」（真机 2026-10-09 反馈）。服务端历史一直在，
     * 网页端本来就会去拉最近一条，小程序缺的就是这一步 —— 两端口径对齐。
     */
    restoreLatestSession() {
      aiChatStream
        .fetchSessions()
        .then((list) => {
          const first = (list || [])[0];
          if (!first) {
            this.greet();
            return;
          }
          this.onPickSession({ currentTarget: { dataset: { id: first.id, title: first.title } } });
        })
        .catch(() => this.greet());
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
        sessionTitle: '',
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
      const pickedTitle = String((e.currentTarget.dataset && e.currentTarget.dataset.title) || '');
      // 消息与**产物**两路并行取：产物要按锚点挂回它当年那一轮。
      // 只拉消息的话，下载卡就没了 —— 服务端历史里只有文字、没有那条指令（真机 2026-10-09 反馈）。
      Promise.all([
        aiChatStream.fetchSessionMessages(id),
        aiChatStream.fetchSessionExports(id).catch(() => []),
      ])
        .then(([msgs, exports]) => {
          const list = [];
          (msgs || [])
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .filter((m) => String(m.content || '').trim().length > 0) // 工具轮 / 空答复不铺成气泡
            .forEach((m) => {
              const text = String(m.content || '');
              const item = {
                key: nextKey(),
                role: m.role === 'user' ? 'user' : 'assistant',
                text: text,
                _mid: m.id, // 临时：给产物找落点用，挂完就删
              };
              // 历史里的助手答复同样可能带 markdown
              if (m.role !== 'user' && looksLikeMarkdown(text)) {
                item.html = markdown.mdToHtml(text);
              }
              list.push(item);
            });
          // 产物挂到锚点之后第一条助手回复上（锚点那轮正文常为空、已经被滤掉）——与网页端同一规则
          const shotRestores = [];
          (exports || []).forEach((ex) => {
            const anchor = ex && ex.messageId != null ? Number(ex.messageId) : null;
            let target = -1;
            for (let i = 0; i < list.length; i += 1) {
              if (anchor != null && Number(list[i]._mid) < anchor) continue;
              if (list[i].role === 'assistant') {
                target = i;
                break;
              }
            }
            if (target < 0) target = list.length - 1;
            if (target >= 0) {
              if (ex.kind === 'screenshot') {
                // 截图不挂下载卡，挂图位：消息里只有文字，**图得按产物 id 单独取一趟**
                list[target].shot = { label: ex.label || '页面截图', exportId: ex.exportId, state: 'loading', filePath: '' };
                shotRestores.push({ key: list[target].key, exportId: ex.exportId, label: ex.label });
              } else {
                list[target].download = {
                  kind: ex.kind,
                  label: ex.label,
                  params: ex.params,
                  exportId: ex.exportId,
                };
              }
            }
          });
          list.forEach((it) => {
            // 留着锚点（倒计时按它挂回原位），只把临时字段去掉
            it.messageId = it._mid;
            delete it._mid;
          });
          this.newSessionFlag = false;
          this.setData({
            messages: list,
            historyOpen: false,
            historyLoading: false,
            sessionId: id,
            sessionTitle: pickedTitle,
            ...this.clearedQueuePatch(),
          });
          // 铺完再逐张取图：loadShot 要按 key 在那条消息上打补丁，得等 setData 之后
          shotRestores.forEach((s) => this.loadShot(s.key, s.exportId, s.label));
          this.scrollToEnd();
        })
        .catch(() => this.setData({ historyLoading: false }));
    },

    // ── 对话缓存 ─────────────────────────────────────────────

    saveCache() {
      const now = Date.now();
      if (this.cacheSavedAt && now - this.cacheSavedAt < CACHE_THROTTLE_MS) {
        // **被节流掉的那一次必须补上（尾触发）**：打字过程中 messages 每几十毫秒变一次，
        // 一轮结束时那最后一次写入（最终正文 + 刚挂上去的图）几乎必然落在节流窗口内 ——
        // 少了这个补写，缓存里留的就是一份**中途快照**，用户关掉抽屉再打开会发现最新一条没了。
        // 真机反馈过这个现象，就是这里。
        if (!this.cachePending) {
          this.cachePending = setTimeout(() => {
            this.cachePending = null;
            this.saveCache();
          }, CACHE_THROTTLE_MS);
        }
        return;
      }
      this.cacheSavedAt = now;
      try {
        // 图片是本地临时路径（或几百 KB 的 data URL），存了没用还撑爆 storage
        const slim = this.data.messages.map((m) => ({
          key: m.key,
          role: m.role,
          text: m.text,
          meta: m.meta,
          // 挂在消息上的导出卡也存：不然重开对话卡片就没了（它现在属于那一条消息）
          download: m.download,
          // 截图只存「是哪一份产物」——**临时文件路径不能跨会话用**（会被清掉），
          // 恢复时按 exportId 重取一份，见 restoreCache。
          shot: m.shot && m.shot.exportId
            ? { label: m.shot.label, exportId: m.shot.exportId, state: 'loading', filePath: '' }
            : undefined,
        }));
        wx.setStorageSync(currentCacheKey(), {
          ts: now,
          messages: slim,
          sessionId: this.data.sessionId,
          sessionTitle: this.data.sessionTitle,
        });
      } catch (e) {
        /* ignore quota */
      }
    },

    restoreCache() {
      try {
        const raw = wx.getStorageSync(currentCacheKey());
        if (!raw || !raw.ts) return;
        if (Date.now() - raw.ts > CACHE_TTL_MS) {
          wx.removeStorageSync(currentCacheKey());
          return;
        }
        const list = (raw.messages || [])
          // 只按「有没有正文」筛会把**只出图/只给文件**的那一轮整条丢掉 ——
          // 那种回合模型常常一个字都不说（它只调了工具），可内容全在卡片上。
          .filter((m) => m && (String(m.text || '').trim() || m.shot || m.download))
          // 缓存里存的是纯文本，恢复时补一次 markdown 转换 ——
          // 否则刷新后原先渲染好的回复会退化成带 ** 的明文
          .map((m) => {
            if (m.role !== 'user' && !m.html && looksLikeMarkdown(m.text)) {
              const html = markdown.mdToHtml(m.text);
              m.html = html;
              if (html.indexOf('<table') >= 0) m.wide = true;
            }
            // 恢复的回复同样要能下载它给的模板
            if (m.role !== 'user' && !m.links) {
              const links = extractDownloadLinks(m.text);
              if (links.length > 0) m.links = links;
            }
            return m;
          });
        if (list.length === 0) return;
        this.setData({
          messages: list,
          sessionId: raw.sessionId || null,
          sessionTitle: String(raw.sessionTitle || ''),
        });
        // 缓存里只留了「是哪一份产物」，图得按 exportId 重取一份（临时文件早没了）
        list.forEach((m) => {
          if (m.shot && m.shot.exportId) this.loadShot(m.key, m.shot.exportId, m.shot.label);
        });
        this.mountTimers();
      } catch (e) {
        /* ignore */
      }
    },

    /**
     * 删掉一条历史对话（**软删**，与服务端同一口径：列表/续聊不再出现，审计留痕保留）。
     *
     * 删的正是当前这条时，要像「新建对话」一样把面板清干净 —— 否则会盯着一份已经删掉的会话继续发。
     */
    onDeleteSession(e) {
      const id = Number(e.currentTarget.dataset && e.currentTarget.dataset.id);
      if (!id) return;
      const self = this;
      wx.showModal({
        title: '删除对话',
        content: '删除后这条对话不再出现在列表里（服务端保留审计留痕）。',
        confirmText: '删除',
        confirmColor: '#ee0a24',
        success(res) {
          if (!res.confirm) return;
          aiChatStream
            .deleteSession(id)
            .then(() => {
              self.setData({
                historyList: (self.data.historyList || []).filter((s) => s.id !== id),
              });
              if (self.data.sessionId === id) self.onNewChat();
            })
            .catch((err) => {
              wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
            });
        },
      });
    },

    clearCache() {
      this.cacheSavedAt = 0;
      try {
        wx.removeStorageSync(currentCacheKey());
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

    /**
     * @param isFollowUp 这条不是**新的一次提问**，而是接着上面那条回复把没办完的事办完
     *   （点了确认执行、答了「导出要哪几维小计」这类工具抛出来的问题）。收拢附件时靠它判断
     *   「是不是还在同一次提问里」—— 少了它，一次提问中间插一个问题，附件就会被切成两条气泡。
     */
    submit(question, images, spreadsheets, isFollowUp) {
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
            isFollowUp: !!isFollowUp,
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
      this.streamBotKey = botKey;
      this.setData({ sending: true, orbState: 'thinking', statusText: '正在思考…' });
      this.scrollToEnd();
      this.startLiveMeta();
      this.stream = starter();
    },

    // ── 实时态（与网页端同口径：思考中 · 3.2s · 1.2k tokens） ──
    // 网页端流式期间会一直显示「已耗时 / 已用 token」；小程序原先只在答完之后给一行「用时」，
    // 等的那段时间屏幕上什么都不动，看着像卡住了（用户 2026-10-09 反馈）。

    /** 起表 + 每 500ms 刷一次；用量到位时也刷（token 是一轮一轮推的，不是逐字） */
    startLiveMeta() {
      this.liveStartAt = Date.now();
      this.liveTokens = 0;
      if (this.liveMetaTimer) clearInterval(this.liveMetaTimer);
      this.tickLiveMeta();
      this.liveMetaTimer = setInterval(() => this.tickLiveMeta(), 500);
    },

    tickLiveMeta() {
      if (!this.liveStartAt) return;
      const sec = (Date.now() - this.liveStartAt) / 1000;
      const parts = ['思考中 ' + sec.toFixed(1) + 's'];
      if (this.liveTokens > 0) parts.push(this.liveTokens.toLocaleString() + ' tokens');
      this.setData({ liveMeta: parts.join(' · ') });
    },

    stopLiveMeta() {
      if (this.liveMetaTimer) {
        clearInterval(this.liveMetaTimer);
        this.liveMetaTimer = null;
      }
      this.liveStartAt = 0;
      if (this.data.liveMeta) this.setData({ liveMeta: '' });
    },

    handlersFor(botKey) {
      return {
        onDelta: (text) => this.appendText(botKey, text),
        onInteraction: (payload) => this.collectInteraction(payload),
        // 用量：每完成一轮模型调用推一次，用来刷实时 token 计数
        onUsage: (u) => {
          this.liveTokens = (u && u.totalTokens) || 0;
          this.tickLiveMeta();
        },
        // 跳转指令先攒着：收到就跳会把模型这句「我帮你打开…」和待答选项一起带走（与服务端同一口径）
        onNavigate: (payload) => {
          this.pendingNav = payload;
        },
        // 下载指令同理攒着：这一轮的话还没说完就把卡片弹出来，用户会以为正文是卡片的注脚
        onDownload: (payload) => {
          this.pendingDownload = payload;
        },
        // **立刻挂上去，不压到这一轮结束**：一轮里可能同时办好几件事（截图/导出/定时），
        // 压到最后用户全程看不到进展，只觉得「特别慢、不知道发生了什么」（真机反馈）。
        onImage: (payload) => {
          this.flushPendingImageNow(payload, botKey);
        },
        // 长任务进度：running 挂一行「正在截图…」，done 撤掉，failed 留着（那正是要害）
        onTool: (payload) => {
          const label = TOOL_BUSY_LABEL[payload && payload.name];
          if (!label) return;
          const idx = this.indexOfKey(botKey);
          if (idx < 0) return;
          const status = payload.status;
          this.setData({
            ['messages[' + idx + '].toolBusy']:
              status === 'running' ? { label: label, status: 'running' }
                : status === 'failed' ? { label: label, status: 'failed' }
                  : null,
          });
        },
        onDone: (payload) => {
          if (payload && typeof payload.sessionId === 'number' && payload.sessionId > 0) {
            this.setData({ sessionId: payload.sessionId });
          }
          // 标记源已结束：打字机把剩下的字吐完会自己停
          this.typeFinished = true;
          this.finishTurn(botKey, null, payload);
          this.flushPendingNav();
          this.flushPendingDownload(botKey);
          // 这一轮可能刚设了定时：拉回来挂到这条消息下（也顺带刷新旧的，等它出结果）
          this.mountTimers();
        },
        onError: (msg) => this.finishTurn(botKey, msg),
      };
    },

    /**
     * 执行攒下来的跳转指令（「帮我打开 X」）。
     *
     * path 是服务端按载体查出来的**小程序页面路径**，但那是「页面权限」里的**主包路径**
     * （`/pages/x/y`），而页面多半已搬进分包 —— 直接跳会**静默失败**（2026-10-09 实测：
     * 点了「帮你打开报修申请」，页面纹丝不动）。所以按分包前缀逐个试，见 subPackageCandidates。
     * tabBar 页只能用 switchTab、普通页只能用 navigateTo：这里靠 navigateTo 失败回落，
     * 免得在小程序里再维护一份 tabBar 名单（那份名单在 app.json，改一处漏一处）。
     */
    flushPendingNav() {
      const nav = this.pendingNav;
      this.pendingNav = null;
      if (!nav || !nav.path) return;
      const stack = getCurrentPages();
      const top = stack && stack.length ? stack[stack.length - 1] : null;
      const self = top && top.route ? '/' + String(top.route).replace(/^\/+/, '') : '';
      const candidates = pagePermission.subPackageCandidates(nav.path);
      if (self && candidates.indexOf(self) >= 0) {
        if (nav.label) wx.showToast({ title: '已经在「' + nav.label + '」了', icon: 'none' });
        return;
      }
      // 抽屉是盖在页面上的浮层，不关掉就把刚跳到的页面挡着了
      this.onClose();
      const fallback = () => wx.showToast({ title: '这个页面打不开', icon: 'none' });
      const step = (i) => {
        if (i >= candidates.length) {
          // 都不是普通页 —— 可能是 tabBar 页（只能用 switchTab）
          wx.switchTab({ url: candidates[candidates.length - 1], fail: fallback });
          return;
        }
        wx.navigateTo({ url: candidates[i], fail: () => step(i + 1) });
      };
      step(0);
      if (nav.label) wx.showToast({ title: '已打开「' + nav.label + '」', icon: 'none' });
    },

    /**
     * 把攒下的下载指令**挂到产出它的那一轮消息上**（不是浮在输入框上面）。
     *
     * 与网页端同一口径：卡片是那句话带出来的，就该跟在那句话下面 ——
     * 浮在底部时它跟任何一句都对不上，用户分不清是哪次导的。
     * 挂在消息上还顺带进了缓存，重开对话卡片还在。
     */
    flushPendingDownload(botKey) {
      const dl = this.pendingDownload;
      this.pendingDownload = null;
      if (!dl || !dl.kind) return;
      const idx = this.indexOfKey(botKey);
      if (idx < 0) return;
      this.setData({ ['messages[' + idx + '].download']: dl });
      this.scrollToEnd();
    },

    /** 空上下文：给 wxml 里 `catch:touchmove` 用，只吃掉事件不做事（挡穿透滚动）。 */
    noop() {},

    /**
     * 点图放大。抽屉里的图是缩放铺的（长页面不铺会把对话顶没），看不清细节，
     * 所以必须给一个点击进系统级预览的口子 —— 那是小程序里唯一能真正放大/手势缩放的地方。
     */
    onShotTap(e) {
      const path = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.path) || '';
      if (!path) return;
      wx.previewImage({ urls: [path], current: path });
    },

    /**
     * 图加载完补一次滚到底。
     *
     * <p>为什么必须补：图是 `widthFix`，**加载完才撑开高度**。而取图那一步的 `scrollToEnd` 发生在
     * 加载之前 —— 那时算出来的「底部」是没算这张图的高度的，等图画出来，底部就跑到屏幕下面去了。
     * 表现是：图上一直在最后一条回复的下面一屏，怎么都看不到（真机反馈过）。
     */
    onShotLoaded() {
      this.scrollToEnd();
    },

    /**
     * 把这个会话的倒计时拉回来、挂到对应那条消息上。
     *
     * <p>与网页端同一口径：实时那轮挂到刚说完那条；历史/缓存恢复按 messageId 挂回原位。
     * 已经挂上的只刷状态 —— 等它从「等待」变成「已执行 / 失败」。
     *
     * <p>归零后会**反复补拉**（见 startTimerTick）直到出结果：服务端调度器每 5 秒才扫一遍，
     * 早问一次多半扑空，只补一次的话卡片会永远停在「正在执行…」。
     */
    mountTimers() {
      const sessionId = this.data.sessionId;
      if (!sessionId) return;
      springAuth
        .springRequest({ url: '/api/v1/ai/timers?scope=mine', method: 'GET', data: {} })
        .then((res) => {
          const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          const data = (body && body.data) || {};
          const rows = (data.list || []).filter((t) => t && t.sessionId === sessionId);
          // 倒计时要对表：服务端时间与本地差多少就补多少（和计时器页同一口径）
          const serverNow = Number(data.serverNowMillis) || 0;
          if (serverNow > 0) this.timerSkewMs = serverNow - Date.now();
          if (rows.length === 0) return;
          const msgs = this.data.messages.slice();
          const mounted = {};
          msgs.forEach((m) => (m.timers || []).forEach((x) => { mounted[x.id] = true; }));
          // ① 已挂上的刷状态 ② 新的找落点
          msgs.forEach((m, i) => {
            if (!m.timers) return;
            msgs[i] = {
              ...m,
              timers: m.timers.map((x) => {
                const fresh = rows.find((y) => y.id === x.id);
                return fresh ? this.toTurnTimer(fresh) : x;
              }),
            };
          });
          rows.filter((r) => !mounted[r.id]).forEach((r) => {
            /*
             * 落点 = **载体刚收尾的那一条**（见 lastFinalizedKey 的注释）。
             * 不看服务端的 messageId：那个锚指的是「工具调用那条消息」，跟这里的消息不是一回事，
             * 而且常常落在挂起那一条上（正文为空、抽屉故意不画），挂上去就隐形了。
             *
             * 判「能不能挂」用 isRenderableMsg 而不是「有没有正文」：只出了图/只挂了卡片的那一轮
             * 同样画得出来。用「有没有正文」会一路回退到最早的问候语上（真机就是这么挂错位置的）。
             */
            let idx = this.lastFinalizedKey ? this.indexOfKey(this.lastFinalizedKey) : -1;
            if (idx < 0 || msgs[idx].role !== 'assistant' || !this.isRenderableMsg(msgs[idx])) {
              idx = -1;
              for (let i = msgs.length - 1; i >= 0; i -= 1) {
                if (msgs[i].role === 'assistant' && this.isRenderableMsg(msgs[i]) && !msgs[i].fromTimer) {
                  idx = i;
                  break;
                }
              }
            }
            if (idx < 0) return;
            msgs[idx] = { ...msgs[idx], timers: [...(msgs[idx].timers || []), this.toTurnTimer(r)] };
          });
          this.setData({ messages: msgs });
          this.tickTimers();
          this.applyTimerTicks();
        })
        .catch(() => { /* 倒计时读不到不影响对话 */ });
    },

    /** 服务端那条计时器 → 这一页要渲染的形状。 */
    toTurnTimer(t) {
      return {
        id: t.id,
        label: t.label || '定时任务',
        fireAtMillis: Number(t.fireAtMillis) || 0,
        status: t.status,
        statusZh: t.statusZh,
        ok: t.ok === undefined ? null : t.ok,
        error: t.error,
      };
    },

    /** 还有在跑的倒计时就每秒走一格（挂在 timerTicks 上，wxml 按 id 取）。 */
    tickTimers() {
      const live = [];
      this.data.messages.forEach((m) => (m.timers || []).forEach((x) => {
        if (TIMER_LIVE_STATUSES.indexOf(x.status) >= 0) live.push(x);
      }));
      if (live.length === 0) {
        if (this.timerTickHandle) { clearInterval(this.timerTickHandle); this.timerTickHandle = null; }
        if (Object.keys(this.data.timerTicks || {}).length) this.setData({ timerTicks: {} });
        return;
      }
      this.applyTimerTicks();
      if (this.timerTickHandle) return;
      this.timerTickHandle = setInterval(() => this.applyTimerTicks(), 1000);
    },

    /**
     * 重算所有倒计时的显示文案（不止在跑的那些 —— 已结束的也要出一句「已执行 · 成功」）。
     * 结果放在 `timerTicks` 上，wxml 按 id 取。
     */
    applyTimerTicks() {
      const now = Date.now() - (this.timerSkewMs || 0);
      const ticks = {};
      let needRefetch = false;
      const finished = [];
      this.data.messages.forEach((m) => (m.timers || []).forEach((x) => finished.push(x)));
      finished.forEach((x) => {
        // 刚从「在跑」变终态 → 必须补拉：定时器写回会话的那条汇报就在这一刻出现。
        // 少了这个判断，跳秒会在卡片变「已完成」的同一拍停下，正好错过那条汇报（真机踩到）。
        const prevStatus = this.timerSeenStatus[x.id];
        if (prevStatus && TIMER_LIVE_STATUSES.indexOf(prevStatus) >= 0
            && TIMER_LIVE_STATUSES.indexOf(x.status) < 0) {
          needRefetch = true;
        }
        this.timerSeenStatus[x.id] = x.status;
        if (TIMER_LIVE_STATUSES.indexOf(x.status) < 0) {
          const failed = x.status === 'FAILED' || x.ok === false || x.ok === 0;
          ticks[x.id] = x.statusZh + (x.status === 'FIRED' ? (failed ? ' · 失败' : ' · 成功') : '')
            + (x.error ? '：' + x.error : '');
          return;
        }
        if (x.status === 'AWAITING_CONFIRM') {
          ticks[x.id] = '等待你确认';
          return;
        }
        const remain = x.fireAtMillis - now;
        if (remain > 0) {
          ticks[x.id] = '还剩 ' + fmtRemain(remain);
          return;
        }
        ticks[x.id] = '正在执行…';
        // 归零之后补拉：每 5 秒一次、最多 24 次（见 mountTimers 的注释）
        const seen = this.timerPoll[x.id] || { at: 0, tries: 0 };
        if (seen.tries < 24 && Date.now() - seen.at >= 5000) {
          this.timerPoll[x.id] = { at: Date.now(), tries: seen.tries + 1 };
          needRefetch = true;
        }
      });
      this.setData({ timerTicks: ticks });
      if (needRefetch) {
        this.mountTimers();
        this.pullNewMessages();
      }
    },

    /**
     * 把服务端**新落进会话**的消息补到界面上。
     *
     * <p>谁会绕开对话流直接往会话里写？**定时器执行完的那条汇报** —— 它跑在调度线程里，
     * 这头没有任何流连接。不补的话：通知都推到他手机上了，对话里却要重开才看得见。
     */
    pullNewMessages() {
      const sessionId = this.data.sessionId;
      if (!sessionId) return;
      aiChatStream
        .fetchSessionMessages(sessionId)
        .then((msgs) => {
          const list = msgs || [];
          if (list.length === 0) return;
          const known = this.data.messages.slice();
          const maxKnown = known.reduce((mx, m) => (m.messageId > mx ? m.messageId : mx), 0);
          // 一个 id 都不知道就**不补**：这种情况无从判断哪条是新的，硬补会把整段对话复制一遍
          if (maxKnown <= 0) return;
          const fresh = list.filter((m) => m.role === 'assistant' && Number(m.id) > maxKnown
            && String(m.content || '').trim().length > 0);
          if (fresh.length === 0) return;
          const appended = fresh.map((m) => {
            const text = String(m.content || '');
            // fromTimer 标记：倒计时兜底找落点时要跳过它（见 mountTimers 的注释）
            const item = { key: nextKey(), role: 'assistant', text: text, typed: true,
              messageId: Number(m.id), fromTimer: true };
            if (looksLikeMarkdown(text)) item.html = markdown.mdToHtml(text);
            return item;
          });
          this.setData({ messages: known.concat(appended) });
          this.scrollToEnd();
        })
        .catch(() => { /* 拉不到就算了，别把这一轮搞坏 */ });
    },

    /** 停止一个倒计时。 */
    onTimerStop(e) {
      const id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : null;
      if (!id) return;
      springAuth
        .springRequest({ url: '/api/v1/ai/timers/' + encodeURIComponent(id) + '/cancel', method: 'POST', data: {} })
        .then(() => { wx.showToast({ title: '已停止', icon: 'none' }); this.mountTimers(); })
        .catch(() => wx.showToast({ title: '没能停止', icon: 'none' }));
    },

    /**
     * 确认一次**到点了但被挂起**的定时。新定时不会再进这个状态（确认前移到建单那一刻），
     * 这个入口是给改造前就卡在「等待确认」的老单子留的。
     */
    onTimerConfirm(e) {
      const id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : null;
      if (!id) return;
      springAuth
        .springRequest({ url: '/api/v1/ai/timers/' + encodeURIComponent(id) + '/confirm', method: 'POST', data: {} })
        .then(() => { wx.showToast({ title: '已确认', icon: 'none' }); this.mountTimers(); })
        .catch(() => wx.showToast({ title: '确认失败', icon: 'none' }));
    },

    /**
     * 把攒下的图片指令挂到产出它的那一轮消息上，并把图取回来。
     *
     * <p>**小程序截不了自己的原生界面**（没有这个 API），所以这条链上的图一律是
     * **服务端渲染好、按产物 id 取回来的**：工具在小程序上返回 `render:'server'`，
     * 编排层当场用无头浏览器把**网页版**渲染出来写进产物，下发的 path 是空的。
     * 代价是截到的是网页版而不是他手机上的界面，而且只有**有网页版的页面**才截得到。
     *
     * <p>图要先落到本地文件才能给 `<image>` 显示（拿的是 arrayBuffer），所以是异步三步：
     * 占位 → 取字节写文件 → ready。中途失败就停在 failed，让卡片自己说清楚。
     */
    /** 图事件到了就立刻挂（见 onImage 的注释）。 */
    flushPendingImageNow(shot, botKey) {
      if (!shot || !shot.exportId) return;
      this.loadShot(botKey, shot.exportId, shot.label);
    },

    /**
     * 把一张截图取回来挂到指定那条消息上。**实时与历史两条路共用**（网页端也是同一口径：
     * 用户在历史里看到的，和他当时看到的是同一个东西）。
     *
     * <p>图要先落到本地文件才能给 `<image>` 显示（拿的是 arrayBuffer），所以是异步三步：
     * 占位 → 取字节写文件 → ready。中途失败就停在 failed，让卡片自己说清楚。
     */
    /**
     * 图取回来之后要写回哪一条 —— **按产物 id 现找**，不能记着当初那个下标。
     *
     * <p>取图是异步三步（占位 → 拉字节 → 写文件），这中间可能刚好有一次「收拢」把这张图
     * 从挂起那条气泡搬到了收尾那条上。按下标写回去会**在旧气泡上又冒出一张**，
     * 而新气泡永远停在「正在截…」。
     */
    patchShotByExport(exportId, shot) {
      const patch = {};
      this.data.messages.forEach((m, i) => {
        if (m.shot && String(m.shot.exportId) === String(exportId)) {
          patch['messages[' + i + '].shot'] = shot;
        }
      });
      if (Object.keys(patch).length) this.setData(patch);
    },

    loadShot(msgKey, exportId, label) {
      const idx = this.indexOfKey(msgKey);
      if (idx < 0) return;
      const name = label || '页面截图';
      // exportId 一并留在数据里：缓存只存这个（临时文件路径不能跨会话用），恢复时靠它重取
      this.setData({ ['messages[' + idx + '].shot']: { label: name, exportId: exportId, state: 'loading', filePath: '' } });
      springAuth
        .springRequestBinary('/api/v1/ai/exports/' + encodeURIComponent(exportId) + '/download', {
          errorMessage: '这张图暂时取不到',
          forbiddenMessage: '没有权限看这张图',
        })
        .then((r) => {
          const file = wx.env.USER_DATA_PATH + '/shot_' + Date.now() + '.png';
          wx.getFileSystemManager().writeFileSync(file, r.data);
          this.patchShotByExport(exportId, { label: name, exportId: exportId, state: 'ready', filePath: file });
          this.scrollToEnd();
        })
        .catch(() => {
          this.patchShotByExport(exportId, { label: name, exportId: exportId, state: 'failed', filePath: '' });
        });
    },

    /**
     * 真去取文件。
     *
     * 参数口径照抄**网页端**那套（工具给的 params 就是为它产的）：`group` / `itemKeyword` / `levels`…
     * 小程序自己的审计页用的是另一套名字（applicantGroup），服务端两种都收，这里不混用。
     */
    onDownloadTap(e) {
      // 卡是**挂在某一条消息上**的，参数就从那条消息里取（不再有全局的那一份）
      const key = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '');
      const idx = key ? this.indexOfKey(key) : -1;
      const dl = idx >= 0 ? this.data.messages[idx].download : null;
      if (!dl || this.data.downloadBusy) return;
      const p = dl.params || {};
      const qs = [];
      const add = (k, v) => {
        if (v === null || v === undefined || String(v) === '') return;
        qs.push(k + '=' + encodeURIComponent(String(v)));
      };
      const itemFamily = p.tab === 'item' || p.tab === 'itemGroup';
      add('tab', p.tab);
      add('from', p.from);
      add('to', p.to);
      add('group', p.group);
      add('applicantUserId', p.applicantUserId);
      add('categoryId', p.categoryId);
      add('itemId', p.itemId);
      add('itemKeyword', p.itemKeyword);
      add('exportLabel', dl.label);
      const levels = this.subtotalLevelsFor(dl);
      if (levels.length > 0) add('levels', levels.join(','));
      add('excludeBlocks', '');
      const path = itemFamily
        ? '/api/material/admin/audit/item/' + (p.itemId || 0) + '/export?' + qs.join('&')
        : '/api/material/admin/stats/export?' + qs.join('&');
      this.setData({ downloadBusy: true });
      wx.showLoading({ title: '正在导出…', mask: true });
      // **有产物 id 就先取存档字节** —— 存档里那份才是用户当时看到的东西。
      // 改过的那张卡**不带导出参数**（它改的是文件本身，不是筛选条件），照着参数重跑会导出一份
      // 全新的、和上一条完全不同的文件；真机 2026-10-09 就是这么把改好的存档**覆盖**成了全量导出，
      // 用户下到的还是带着「数量」列的那份。网页端一直是先取存档的，这里漏了。
      const archived = dl.exportId
        ? springAuth
            .springRequestBinary('/api/v1/ai/exports/' + encodeURIComponent(dl.exportId) + '/download', {})
            .catch(() => null)
        : Promise.resolve(null);
      archived
        .then((hit) => {
          if (hit && hit.data) return hit;
          // **带地址的导出**（动物订购这类）：后端给的是页面那个「导出」按钮同一条接口的相对地址，
          // 按它取就行。这一支必须排在物资那套前面 —— 让它落到物资重跑不但会下到一份完全无关的文件，
          // 还会**把错的那份归档到这条产物上**（真机 2026-10-09 就是这个形状）。
          if (typeof p.url === 'string' && p.url) {
            return springAuth.springRequestBinary(p.url,
              { errorMessage: '导出失败', forbiddenMessage: '无权限导出' });
          }
          if (dl.kind && dl.kind !== 'materialAudit') {
            // 未知类型又没地址：宁可说取不到，也不拿物资那套糊过去
            throw new Error('这份导出暂时取不到文件，让助手重新导一次');
          }
          if (!dl.params || Object.keys(dl.params).length === 0) {
            // 存档没了、又没有可重跑的参数 = 这份文件真的取不回来了，别拿一份别的糊过去
            throw new Error('这份文件的存档已经取不到了，让助手重新导一次');
          }
          return springAuth.springRequestBinary(path,
            { errorMessage: '导出失败', forbiddenMessage: '无权限导出' });
        })
        .then(async (r) => {
          wx.hideLoading();
          this.setData({ downloadBusy: false });
          const safe = String((dl.label || 'export') + '.xlsx').replace(/[\\/:*?"<>|]/g, '_');
          const file = wx.env.USER_DATA_PATH + '/exp_' + Date.now() + '_' + safe.slice(0, 60);
          try {
            wx.getFileSystemManager().writeFileSync(file, r.data);
          } catch (e) {
            wx.showToast({ title: '文件写入失败', icon: 'none' });
            return;
          }
          // 交回服务端归档 —— 不归档就只能重新导一遍，改不了「刚才那份」。
          // 归档失败不当错误报（文件已经到手了），所以它 resolve(false) 而不是 reject。
          await springAuth.archiveExportContent(dl.exportId, file);
          wx.openDocument({
            filePath: file,
            showMenu: true, // 允许「用其他应用打开」/转发，等于给了保存出口
            fail: () => wx.showToast({ title: '打不开这个格式', icon: 'none' }),
          });
        })
        .catch((err) => {
          wx.hideLoading();
          this.setData({ downloadBusy: false });
          wx.showToast({ title: (err && err.message) || '导出失败', icon: 'none' });
        });
    },

    /**
     * 这份导出该用哪几级小计。
     *
     * <p>用户勾过层级的那张卡（`mode=direct`）带着 levels，**顺手记成「上次的配置」**；
     * 「用上次的」那张卡（`mode=last`）不带 levels，就取上次记下的那组。
     * 网页端一直是这么做的（配置存在浏览器里），小程序原先两边都没存 ——
     * 于是「用上次的」在小程序上等于「全保留」：明明上次只要「总计」，下一次却把
     * 课题组/申领人/物品小计全带回来（真机 2026-10-09 实测复现）。
     *
     * <p>按导出族分开存（按物品那两页签是另一套口径），键名与网页端一致。
     */
    subtotalLevelsFor(dl) {
      const p = (dl && dl.params) || {};
      const itemFamily = p.tab === 'item' || p.tab === 'itemGroup';
      const key = itemFamily ? 'fm-export-subtotal:material-item-flow' : 'fm-export-subtotal:material-audit';
      const picked = Array.isArray(p.levels) ? p.levels.filter((x) => x) : [];
      if (picked.length > 0) {
        try {
          wx.setStorageSync(key, picked);
        } catch (e) {
          /* 存不下不影响这次导出 */
        }
        return picked;
      }
      try {
        const saved = wx.getStorageSync(key);
        return Array.isArray(saved) ? saved : [];
      } catch (e) {
        return [];
      }
    },

    pushBotTurn(botKey) {
      /*
       * **别把未答的普通问题一起清掉。**
       *
       * 一轮里可能有多个工具各抛一次交互（导出要选维度 + 建定时要确认）。写操作的确认会把那一轮
       * **挂起收尾**、选项先渲染出来；点「确认执行」续跑时要开新的一轮 —— 如果这里无条件清队列，
       * 导出那批未答的选项就被**覆盖没了**（真机反馈）。
       * 只清「确认」类（这一次就是回答它），普通问题留着继续问。
       */
      const kept = (this.data.queue || []).filter((q) => q.kind !== 'confirm');
      this.setData({
        messages: this.data.messages.concat([
          { key: botKey, role: 'assistant', text: '', pending: true, typing: true },
        ]),
        ...this.clearedQueuePatch(),
        queue: kept,
      });
      if (kept.length > 0) this.syncWizard(kept, [], 0);
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
          /** 多选题：勾完点「确认」一次性提交（与网页端同一个约定） */
          multiSelect: payload.multiSelect === true,
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
        currentOptions: (cur ? cur.options : []).map((o) => ({ ...o, _on: false })),
        currentQuestion: cur ? cur.question || '' : '',
        currentAnswer: a[i] || '',
        currentMulti: !!cur && cur.multiSelect === true,
        // 换到下一题就把勾选清掉：上一题的勾留在这里会让人以为已经勾过了
        multiPick: [],
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

      // 多选题：点一下是**勾/取消**，不是提交 —— 提交走下面的「确认」。
      // 与网页端同一约定：选项在这里是复选，点一个就发出去反而凑不出多项。
      if (this.data.currentMulti) {
        const picked = this.data.multiPick.slice();
        const at = picked.indexOf(value);
        if (at >= 0) {
          picked.splice(at, 1);
        } else {
          picked.push(value);
        }
        // 注意 this 的坑：map/forEach 回调里用 this 会丢上下文（本项目踩过），这里全用箭头/局部变量
        this.setData({
          multiPick: picked,
          currentOptions: this.data.currentOptions.map((o) => ({ ...o, _on: picked.indexOf(o.value) >= 0 })),
        });
        return;
      }

      const q = this.data.queue[this.data.current];
      if (q && q.kind === 'confirm') {
        const chosen = (q.options.find((o) => o.value === value) || {}).label || value;
        this.submitInteraction(q.token, value, chosen);
        return;
      }
      if (!this.data.wizardMode) {
        this.submit(value, null, null, true);
        return;
      }
      const answers = this.data.answers.slice();
      answers[this.data.current] = value;
      const next = Math.min(this.data.current + 1, this.data.queue.length - 1);
      this.setData({ answers: answers, current: next, customDraft: '' });
      this.syncWizard(null, answers, next);
    },

    /**
     * 多选题的「确认」：把勾中的值**逗号连接**成一句回给模型。
     *
     * <p>与网页端同一约定：发出去的是选项的 `value`，用户那侧留的是 label。
     * 勾完不点确认就切题/发送，等于这次勾选白勾 —— 所以这里挡一下空的。
     */
    onConfirmMulti() {
      if (this.data.sending) return;
      const picked = this.data.multiPick || [];
      if (picked.length === 0) {
        wx.showToast({ title: '至少勾一项', icon: 'none' });
        return;
      }
      const opts = this.data.currentOptions || [];
      const labels = picked.map((v) => {
        const hit = opts.filter((o) => o.value === v)[0];
        return hit ? hit.label : v;
      });
      const q = this.data.queue[this.data.current];
      const joined = picked.join(',');
      if (q && q.kind === 'confirm') {
        this.submitInteraction(q.token, joined, labels.join('、'));
        return;
      }
      if (!this.data.wizardMode) {
        this.submit(joined, null, null, true);
        return;
      }
      const answers = this.data.answers.slice();
      answers[this.data.current] = joined;
      this.setData({ answers: answers });
      this.syncWizard(this.data.queue, answers, this.data.current);
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
      // **只把这一个「确认」拿掉，别整个清空**：一轮里可能有多个工具各抛一次交互
      // （导出要选维度 + 建定时要确认），点确认只是回答后者 —— 整个清空会把导出那批
      // 还没答的问题一起抹掉（真机反馈过「导出的选项没了」）。
      const kept = (this.data.queue || []).filter((q) => q.kind !== 'confirm');
      this.setData({
        messages: this.data.messages.concat([
          // isFollowUp：这不是新的一次提问，是接着上面那条回复把没办完的事办完
          { key: userKey, role: 'user', text: label, isFollowUp: true },
          { key: botKey, role: 'assistant', text: '', pending: true, typing: true },
        ]),
        draft: '',
        canSend: false,
        ...this.clearedQueuePatch(),
        queue: kept,
      });
      if (kept.length > 0) this.syncWizard(kept, [], 0);
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
        this.submit(text, null, null, true);
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
      this.submit(composeAnswers(q, filled), null, null, true);
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
      if (looksLikeMarkdown(body)) {
        const html = markdown.mdToHtml(body);
        patch['messages[' + idx + '].html'] = html;
        // 表格在这条里：气泡要放行到整幅宽，否则 76% 的常规气泡把列挤成一条条
        if (html.indexOf('<table') >= 0) patch['messages[' + idx + '].wide'] = true;
      }
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

    /**
     * 把同一次提问产出的附件**并到这一次提问真正收尾的那条气泡上**。
     *
     * <p>一次提问中间可能挂起过（写操作要确认）—— 挂起**不算这次提问结束**，点完确认办的还是同一件事。
     * 可挂起那轮的正文是空的（抽屉故意不画它），图/导出卡挂上去就等于没挂。于是往前收：
     * 遇到助手轮就搬它的附件；遇到「确认执行」那条用户轮继续往前；遇到真正的新提问就停。
     *
     * <p>**搬完清空源**：源那条本来就不画，清掉不损失任何东西，同时让「又收尾一次」不会重复搬 ——
     * 天然幂等。
     */
    gatherArtifacts(botKey) {
      const msgs = this.data.messages.slice();
      const lastIdx = this.indexOfKey(botKey);
      if (lastIdx < 0 || msgs[lastIdx].role !== 'assistant') return;
      const target = msgs[lastIdx];
      // 目标自己已经有的算「更新的」，保留（一次提问里连截两张时，要留后一张）
      let shot = target.shot || null;
      let download = target.download || null;
      const timers = (target.timers || []).slice();
      const sources = [];
      for (let i = lastIdx - 1; i >= 0; i -= 1) {
        const t = msgs[i];
        if (t.role === 'user') {
          if (t.isFollowUp) continue; // 续答（点确认、答工具抛的问题）不算新提问，继续往前收
          break; // 上一次真正的提问 → 停
        }
        if (!t.shot && !t.download && !(t.timers && t.timers.length)) continue;
        if (t.shot && !shot) shot = t.shot;
        if (t.download && !download) download = t.download;
        (t.timers || []).forEach((x) => {
          if (!timers.some((y) => String(y.id) === String(x.id))) timers.push(x);
        });
        sources.push(i);
      }
      if (sources.length === 0) return;
      const patch = {};
      if (shot) patch['messages[' + lastIdx + '].shot'] = shot;
      if (download) patch['messages[' + lastIdx + '].download'] = download;
      if (timers.length) patch['messages[' + lastIdx + '].timers'] = timers;
      sources.forEach((i) => {
        patch['messages[' + i + '].shot'] = null;
        patch['messages[' + i + '].download'] = null;
        patch['messages[' + i + '].timers'] = null;
      });
      this.setData(patch);
    },

    /** 这一条会不会被画出来 —— 判据必须与 wxml 那条 wx:if **逐字一致**（见 index.wxml）。 */
    isRenderableMsg(m) {
      if (m.role !== 'assistant') return true;
      return !!(String(m.text || '').trim() || m.shot || m.download || (m.timers && m.timers.length));
    },

    /** 收尾：errorText 非空表示这条是错误文案 */
    finishTurn(botKey, errorText, payload) {
      this.stopLiveMeta();
      // **刚收尾的就是这一条**（key 是稳定的，不像 id 那样两头对不上）
      this.lastFinalizedKey = botKey;
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
        // 记下这一轮助手消息的 id：补拉新消息、把倒计时挂回原位都靠它。
        // 不记的话，「服务端又落进来的消息」无从比对，会把已显示的再追加一遍（真机看到重复回复）
        if (payload && payload.messageId != null) {
          patch['messages[' + idx + '].messageId'] = Number(payload.messageId);
        }
      }
      this.setData(patch);
      // 这一次提问真正收尾了：把中间挂起那几轮上的附件并到这条上（见 gatherArtifacts）
      this.gatherArtifacts(botKey);
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
      // **中止也要给那一轮收尾**：否则那条「正在思考…」的气泡会永远挂着。
      // 真机路径很常见：打开抽屉时问候语那条流刚起来，用户立刻打字发消息 ——
      // submit 里的 startStream 会先把它中止，于是问候语那条就卡在「正在思考」下不来了
      // （2026-10-09 用户报的就是这个）。
      const key = this.streamBotKey;
      this.streamBotKey = null;
      if (key) this.finishAbortedTurn(key);
    },

    /** 被中止的那一轮：说过话、或已经挂上了附件就留成一条；什么都没有才整个撤掉，别留空气泡。 */
    finishAbortedTurn(botKey) {
      const idx = this.indexOfKey(botKey);
      if (idx < 0) return;
      const msg = this.data.messages[idx];
      // 判据带上附件：图已经贴上了却被当成空气泡撤掉，等于把用户刚看到的东西吞了
      if (msg && this.isRenderableMsg(msg)) {
        this.finishTurn(botKey, null, null);
        return;
      }
      const next = this.data.messages.slice();
      next.splice(idx, 1);
      this.setData({
        messages: next,
        sending: false,
        orbState: 'idle',
        statusText: '在线',
        canSend: this.data.draft.trim().length > 0,
      });
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
      // 键是 **path**（onPickImage 存的就是它）。以前这里取 dataset.url —— 那是 undefined，
      // 过滤条件 `i.path !== undefined` 恒真，于是点任意一张都会把**全部**待发图清掉。
      const path = e.currentTarget.dataset.path;
      this.setData({
        images: this.data.images.filter((i) => i.path !== path),
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
