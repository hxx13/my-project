/**
 * ai-drawer-detail —— AI 对话抽屉的「详情」二级抽屉：底部半屏，说明一句话 + 能力提示词清单。
 *
 * <p>结构照抄 export-config-sheet：`van-popup`（bottom，圆角）+ 头部固定 + 内容区独立滚动，
 * 不出现两层嵌套滚动。文案走 aiCopy（后端可配、取不到回落兜底）；**只读态**的能力清单来自
 * 按视角过滤的接口 `/api/v1/ai/drawer/content` —— 后端已过滤好，这里**不再判视角**。
 *
 * <p>交互：点一条 → `triggerEvent('pick', { text: 那句提示词 })`，由宿主填进输入框，**本组件不发送**。
 *
 * <p><b>编辑态（仅 ≥SUPER_ADMIN）</b>：抽屉头部一颗「编辑」文字按钮，点开**就在同一个抽屉里**换成
 * 编辑界面（不再叠第三层），文案 / 能力清单两个分区在同一滚动容器内切换。进编辑态时**改从管理端只读口
 * `/api/v1/ai/drawer/admin/content` 取数**（未按视角过滤、带中文名与 enabled / audience、含停用行）——
 * 只有它能让「读整份 → 改 → 存整份」闭环，取只读面会缺两列与停用行、一存就清空可见人群。非超管整条
 * 路径上不出现任何编辑元素，也不发任何写请求。写入两件套集中在 {@link module:utils/aiDrawerAdmin}，本组件不直发。
 */
const springAuth = require('../../utils/springAuth.js');
const aiCopy = require('../../utils/aiCopy.js');
const aiDrawerAdmin = require('../../utils/aiDrawerAdmin.js');

const CONTENT_URL = '/api/v1/ai/drawer/content';

/** 界面兜底原文（后端没配时就用这些，与登记进 AiDrawerCopySeed 的默认值逐字一致）。 */
const FALLBACK = {
  TITLE: '我能帮你做这些',
  DESC: '点一句话即可填入输入框，你可以先改一改再发送。',
  LOADING: '读取中…',
  EMPTY: '暂时没有可用的提示词',
  FAIL: '清单没拉取到，稍后再试',
  CLOSE: '关闭',
  // —— 反馈入口（吸底按钮，文案在反馈组件里另有一份） ——
  FEEDBACK: '我要反馈',
  // —— 编辑态 ——
  EDIT: '编辑',
  EDIT_TITLE: '维护抽屉内容',
  TAB_COPY: '界面文案',
  TAB_CAPS: '能力清单',
  SAVE: '保存',
  SAVING: '保存中…',
  CANCEL: '取消',
  RESET: '恢复默认',
  ADD: '新增一条',
  UP: '上移',
  DOWN: '下移',
  REMOVE: '删除',
  SAVED: '已保存',
  SAVE_FAIL: '保存失败',
  NO_CAP: '还没有条目，点下面新增一条',
  TITLE_PH: '标题（一行）',
  PROMPT_PH: '点一下填入输入框的那句话',
  NOTE_PH: '操作备注：点了会做什么',
  NOTE_TAG: '说明',
  ENABLED: '启用',
  AUDIENCE: '谁看得见',
  AUDIENCE_ALL: '全员',
  AUDIENCE_STAFF: '教职工',
  AUDIENCE_STUDENT: '学生',
  AUDIENCE_ADMIN: '管理员',
  AUDIENCE_SUPER: '超管',
};

/**
 * 可见范围取值白名单：空串 = 全员，其余照后端口径（视角 STAFF/STUDENT、角色档 ADMIN/SUPER_ADMIN）。
 *
 * <p>**改这里必须同步后端 `AiDrawerContentService#visibleTo`。** 编辑器是「读整份 → 改 → 存整份」，
 * 不在白名单里的值会被改写成「全员」—— 那等于把管理员条目偷偷放开给所有人，且悄无声息。
 * 原先只认 STAFF/STUDENT，角色档一存就丢，就是这么来的。
 */
const AUDIENCE_VALUES = ['', 'STAFF', 'STUDENT', 'ADMIN', 'SUPER_ADMIN'];

function normAudience(v) {
  const s = v == null ? '' : String(v);
  return AUDIENCE_VALUES.indexOf(s) >= 0 ? s : '';
}

/** 取全部 ai.copy.detail.* 的编辑态文案（一次 settle，界面上直接绑 data）。 */
function editCopyText() {
  return {
    editText: aiCopy.copy('ai.copy.detail.edit', FALLBACK.EDIT),
    editTitleText: aiCopy.copy('ai.copy.detail.editTitle', FALLBACK.EDIT_TITLE),
    tabCopyText: aiCopy.copy('ai.copy.detail.tabCopy', FALLBACK.TAB_COPY),
    tabCapsText: aiCopy.copy('ai.copy.detail.tabCaps', FALLBACK.TAB_CAPS),
    saveText: aiCopy.copy('ai.copy.detail.save', FALLBACK.SAVE),
    savingText: aiCopy.copy('ai.copy.detail.saving', FALLBACK.SAVING),
    cancelText: aiCopy.copy('ai.copy.detail.cancel', FALLBACK.CANCEL),
    resetText: aiCopy.copy('ai.copy.detail.reset', FALLBACK.RESET),
    addText: aiCopy.copy('ai.copy.detail.add', FALLBACK.ADD),
    upText: aiCopy.copy('ai.copy.detail.up', FALLBACK.UP),
    downText: aiCopy.copy('ai.copy.detail.down', FALLBACK.DOWN),
    removeText: aiCopy.copy('ai.copy.detail.remove', FALLBACK.REMOVE),
    savedText: aiCopy.copy('ai.copy.detail.saved', FALLBACK.SAVED),
    saveFailText: aiCopy.copy('ai.copy.detail.saveFail', FALLBACK.SAVE_FAIL),
    noCapText: aiCopy.copy('ai.copy.detail.noCap', FALLBACK.NO_CAP),
    titlePh: aiCopy.copy('ai.copy.detail.titlePlaceholder', FALLBACK.TITLE_PH),
    promptPh: aiCopy.copy('ai.copy.detail.promptPlaceholder', FALLBACK.PROMPT_PH),
    notePh: aiCopy.copy('ai.copy.detail.notePlaceholder', FALLBACK.NOTE_PH),
    noteTagText: aiCopy.copy('ai.copy.detail.noteTag', FALLBACK.NOTE_TAG),
    enabledText: aiCopy.copy('ai.copy.detail.enabled', FALLBACK.ENABLED),
    audienceText: aiCopy.copy('ai.copy.detail.audience', FALLBACK.AUDIENCE),
    audienceAllText: aiCopy.copy('ai.copy.detail.audienceAll', FALLBACK.AUDIENCE_ALL),
    audienceStaffText: aiCopy.copy('ai.copy.detail.audienceStaff', FALLBACK.AUDIENCE_STAFF),
    audienceStudentText: aiCopy.copy('ai.copy.detail.audienceStudent', FALLBACK.AUDIENCE_STUDENT),
    audienceAdminText: aiCopy.copy('ai.copy.detail.audienceAdmin', FALLBACK.AUDIENCE_ADMIN),
    audienceSuperText: aiCopy.copy('ai.copy.detail.audienceSuper', FALLBACK.AUDIENCE_SUPER),
  };
}

/**
 * 把接口的 capabilities（`[{ groupName, items: [{id,title,promptText}] }]`）收敛成可渲染形状。
 * 空组、缺 promptText 的条目一律丢掉；结构异常给空表（**绝不抛**，抽屉不能开成空白/报错）。
 */
function normalizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => ({
      groupName: String((g && g.groupName) || ''),
      items: Array.isArray(g && g.items)
        ? g.items
            .filter((it) => it && String(it.promptText || '').trim())
            .map((it) => ({
              id: it.id,
              title: String(it.title || ''),
              promptText: String(it.promptText || ''),
              note: String((it && it.note) || ''),
            }))
        : [],
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * 把管理端返回的**扁平**能力清单（`[{id,groupName,title,promptText,sortOrder,enabled,audience}]`，
 * 含停用行）拍平成编辑行，并挂稳定 uid 供 wx:key。**不丢行**（停用、空提示词都留着，超管要能改回来）。
 */
function buildCapRows(items, startUid) {
  let n = startUid || 0;
  const out = [];
  (Array.isArray(items) ? items : []).forEach((it) => {
    if (!it) return;
    n += 1;
    out.push({
      uid: 'c' + n,
      id: it.id == null ? null : it.id,
      groupName: it.groupName == null ? '' : String(it.groupName),
      title: it.title == null ? '' : String(it.title),
      promptText: it.promptText == null ? '' : String(it.promptText),
      note: it.note == null ? '' : String(it.note),
      enabled: it.enabled !== false,
      audience: normAudience(it.audience),
    });
  });
  out.__nextUid = n;
  return out;
}

/**
 * 拉一次内容接口；任何失败都收敛成 `{ ok:false, copy:{}, capabilities:[] }`（调用点据此走空态）。
 * `copy` 是「键→当前生效值」（后端已把缺配的填成代码默认），编辑态据此列行；没有中文名就退回键本身。
 */
function fetchContent() {
  return springAuth
    .springRequest({ url: CONTENT_URL, method: 'GET', data: {} })
    .then((res) => {
      const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (body && body.success && body.data) {
        const copy =
          body.data.copy && typeof body.data.copy === 'object' ? body.data.copy : {};
        return { ok: true, copy: copy, capabilities: normalizeGroups(body.data.capabilities) };
      }
      return { ok: false, copy: {}, capabilities: [] };
    })
    .catch(() => ({ ok: false, copy: {}, capabilities: [] }));
}

Component({
  properties: {
    /** 由宿主控制开合 */
    show: { type: Boolean, value: false },
  },

  data: {
    loading: false,
    /** 能力清单分组（空表时走空态，不画空白） */
    groups: [],
    titleText: FALLBACK.TITLE,
    descText: FALLBACK.DESC,
    loadingText: FALLBACK.LOADING,
    emptyText: FALLBACK.EMPTY,
    closeText: FALLBACK.CLOSE,
    // —— 反馈入口 ——
    feedbackOpen: false,
    feedbackText: FALLBACK.FEEDBACK,
    // —— 编辑态 ——
    isAdmin: false,
    editing: false,
    saving: false,
    contentLoading: false, // 进编辑态时正从管理端口取整份内容
    editTab: 'copy', // 'copy' | 'caps'
    copyList: [], // 文案编辑行：{ key, label, value, origValue }
    capList: [], // 能力编辑行：{ uid, id, groupName, title, promptText, enabled, audience }
    nextUid: 0, // 新增行的 uid 发号器
    editText: FALLBACK.EDIT,
    editTitleText: FALLBACK.EDIT_TITLE,
    tabCopyText: FALLBACK.TAB_COPY,
    tabCapsText: FALLBACK.TAB_CAPS,
    saveText: FALLBACK.SAVE,
    savingText: FALLBACK.SAVING,
    cancelText: FALLBACK.CANCEL,
    resetText: FALLBACK.RESET,
    addText: FALLBACK.ADD,
    upText: FALLBACK.UP,
    downText: FALLBACK.DOWN,
    removeText: FALLBACK.REMOVE,
    savedText: FALLBACK.SAVED,
    saveFailText: FALLBACK.SAVE_FAIL,
    noCapText: FALLBACK.NO_CAP,
    titlePh: FALLBACK.TITLE_PH,
    promptPh: FALLBACK.PROMPT_PH,
    notePh: FALLBACK.NOTE_PH,
    noteTagText: FALLBACK.NOTE_TAG,
    enabledText: FALLBACK.ENABLED,
    audienceText: FALLBACK.AUDIENCE,
    audienceAllText: FALLBACK.AUDIENCE_ALL,
    audienceStaffText: FALLBACK.AUDIENCE_STAFF,
    audienceStudentText: FALLBACK.AUDIENCE_STUDENT,
    audienceAdminText: FALLBACK.AUDIENCE_ADMIN,
    audienceSuperText: FALLBACK.AUDIENCE_SUPER,
  },

  observers: {
    // 每次打开都拉一次：文案（aiCopy 缓存）+ 能力清单（本组件自拉）；顺手判一次超管身份
    show(v) {
      if (v) this.loadContent();
    },
  },

  methods: {
    /**
     * 拉内容并铺界面。**先摆兜底文案**（接口慢/挂掉也不是一片空白），拿到后再覆盖。
     * 拉取失败与「本来就没有」是两回事：文案分开，但都落成**明确空态**。
     */
    loadContent() {
      const self = this;
      // 非超管不进编辑态；重新打开时把上一轮的编辑态清干净
      const isAdmin = aiDrawerAdmin.isAdmin();
      this.setData({ loading: true, groups: [], isAdmin: isAdmin, editing: false, saving: false, feedbackOpen: false });
      Promise.all([aiCopy.loadCopy(), fetchContent()]).then(([, content]) => {
        const failed = !content.ok;
        self.setData({
          loading: false,
          groups: (content.capabilities || []).map((g) => Object.assign({ folded: false }, g)),
          titleText: aiCopy.copy('ai.copy.detail.title', FALLBACK.TITLE),
          descText: aiCopy.copy('ai.copy.detail.desc', FALLBACK.DESC),
          loadingText: aiCopy.copy('ai.copy.detail.loading', FALLBACK.LOADING),
          closeText: aiCopy.copy('ai.copy.detail.close', FALLBACK.CLOSE),
          feedbackText: aiCopy.copy('ai.copy.feedback.open', FALLBACK.FEEDBACK),
          emptyText: failed
            ? aiCopy.copy('ai.copy.detail.fail', FALLBACK.FAIL)
            : aiCopy.copy('ai.copy.detail.empty', FALLBACK.EMPTY),
          ...editCopyText(),
        });
      });
    },

    /**
     * 折叠/展开一个分组。清单有二十来条、一屏放不下，分组头让人能先收起来扫一眼。
     * 只改这一组的 folded 标记（setData 走路径，不动整份数组，省一次全量重排）。
     */
    onToggleGroup(e) {
      const gi = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.gi) || 0);
      const g = this.data.groups[gi];
      if (!g) return;
      this.setData({ ['groups[' + gi + '].folded']: !g.folded });
    },

    /** 点一条：只把这句话抛给宿主（宿主填进输入框，**不发送**）。编辑态里不触发。 */
    onPickItem(e) {
      if (this.data.editing) return;
      const text =
        (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.text) || '';
      if (!text) return;
      this.triggerEvent('pick', { text: text });
    },

    onClose() {
      this.triggerEvent('close');
    },

    /** 打开反馈半屏（组件挂在详情 popup 之外，由这里控开合）。 */
    onOpenFeedback() {
      this.setData({ feedbackOpen: true });
    },

    onCloseFeedback() {
      this.setData({ feedbackOpen: false });
    },

    // ── 编辑态进出 ──────────────────────────────────────────

    /** 进编辑态。**非超管直接吞掉**（界面上根本没有该按钮，这里是第二道闸）。 */
    onEdit() {
      if (!this.data.isAdmin || this.data.editing) return;
      // 进编辑态才向**管理端只读口**取整份（未过滤、带中文名与 enabled/audience）——
      // 只读态那个口是按视角过滤的，取它会缺两列与停用行，一存就把可见人群清空。
      this.setData({ editing: true, saving: false, contentLoading: true, editTab: 'copy' });
      const self = this;
      return aiDrawerAdmin
        .fetchAdminContent()
        .then((data) => {
          const capList = buildCapRows(data && data.capabilities, 0);
          self.setData({
            contentLoading: false,
            nextUid: capList.__nextUid || 0,
            capList: capList,
            copyList: buildCopyRowsFromAdmin(data && data.copy),
          });
        })
        .catch((err) => {
          // 取不到就**如实报错并退回只读态**，绝不铺成空清单（那看起来像「清单被清空了」）。
          self.setData({ contentLoading: false, editing: false });
          self._toast(failMessage(aiCopy.copy('ai.copy.detail.fail', FALLBACK.FAIL), err), 'none');
        });
    },

    /** 退出编辑态并丢弃草稿（下次进入按服务端最新值重新铺）。 */
    onCancelEdit() {
      if (this.data.saving) return;
      this.setData({ editing: false });
      this.loadContent();
    },

    onSwitchTab(e) {
      const tab =
        (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'copy';
      if (tab === this.data.editTab) return;
      this.setData({ editTab: tab });
    },

    // ── 文案编辑 ────────────────────────────────────────────

    onCopyInput(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.copyList.length) return;
      const patch = {};
      patch['copyList[' + i + '].value'] = e.detail.value;
      this.setData(patch);
    },

    /** 恢复默认 = 把该键的值清空，保存时提交空串（后端写回 NULL，回落代码默认）。 */
    onResetCopy(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.copyList.length) return;
      const patch = {};
      patch['copyList[' + i + '].value'] = '';
      this.setData(patch);
    },

    // ── 能力清单编辑 ────────────────────────────────────────

    /** 操作备注：点了会做什么（给用户看的说明）。 */
    onCapNote(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.capList.length) return;
      const patch = {};
      patch['capList[' + i + '].note'] = e.detail.value;
      this.setData(patch);
    },

    onCapTitle(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.capList.length) return;
      const patch = {};
      patch['capList[' + i + '].title'] = e.detail.value;
      this.setData(patch);
    },

    onCapPrompt(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.capList.length) return;
      const patch = {};
      patch['capList[' + i + '].promptText'] = e.detail.value;
      this.setData(patch);
    },

    /** 新增一条空行（id=null，保存时后端当新增）。默认启用、全员可见。 */
    onAddCap() {
      const uid = (this.data.nextUid || 0) + 1;
      const list = this.data.capList.concat([
        {
          uid: 'c' + uid,
          id: null,
          groupName: '',
          title: '',
          promptText: '',
          enabled: true,
          audience: '',
        },
      ]);
      this.setData({ capList: list, nextUid: uid });
    },

    /** 启用开关（mini-switch change：{ value: 新布尔 }）。 */
    onCapEnabled(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.capList.length) return;
      const patch = {};
      patch['capList[' + i + '].enabled'] = !!(e && e.detail && e.detail.value);
      this.setData(patch);
    },

    /** 谁看得见：五选一。值按后端口径 —— 全员 = ''、教职工/学生 = 视角、管理员/超管 = 角色档。 */
    onCapAudience(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.capList.length) return;
      const v = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value) || '';
      const patch = {};
      patch['capList[' + i + '].audience'] = normAudience(v);
      this.setData(patch);
    },

    onRemoveCap(e) {
      const i = indexOf(e);
      if (i < 0 || i >= this.data.capList.length) return;
      const list = this.data.capList.slice();
      list.splice(i, 1);
      this.setData({ capList: list });
    },

    onMoveUp(e) {
      this._move(indexOf(e), -1);
    },

    onMoveDown(e) {
      this._move(indexOf(e), 1);
    },

    /** 数组内换位；越界不动（首条上移 / 末条下移是 no-op）。 */
    _move(i, delta) {
      const list = this.data.capList.slice();
      const j = i + delta;
      if (i < 0 || i >= list.length || j < 0 || j >= list.length) return;
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
      this.setData({ capList: list });
    },

    // ── 保存 ────────────────────────────────────────────────

    /**
     * 保存当前分区。**保存中禁重复提交**；成功提示 + 退出编辑并重拉；失败**如实提示、留在编辑态**，
     * 绝不把界面改成「已保存」的样子（草稿原样留着好让人改完再传）。
     */
    onSave() {
      if (this.data.saving) return;
      if (this.data.editTab === 'copy') return this._saveCopy();
      return this._saveCaps();
    },

    _saveCopy() {
      const values = {};
      this.data.copyList.forEach((r) => {
        if (r.value !== r.origValue) values[r.key] = r.value;
      });
      if (Object.keys(values).length === 0) {
        // 没有改动：不空跑网络，直接当成功退出
        this._toast(this.data.savedText, 'success');
        this.setData({ editing: false });
        this.loadContent();
        return Promise.resolve();
      }
      this.setData({ saving: true });
      const self = this;
      return aiDrawerAdmin
        .saveCopy(values)
        .then(() => {
          self.setData({ saving: false, editing: false });
          self._toast(self.data.savedText, 'success');
          self.loadContent();
        })
        .catch((err) => {
          self.setData({ saving: false });
          self._toast(failMessage(self.data.saveFailText, err), 'none');
        });
    },

    _saveCaps() {
      // **整份提交**：每条都带 enabled 与 audience，缺了后端就按缺省覆盖（可见人群会被清成全员）。
      const items = this.data.capList.map((it, i) => ({
        id: it.id,
        groupName: it.groupName,
        title: String(it.title || '').trim(),
        promptText: String(it.promptText || '').trim(),
        note: String(it.note || '').trim(),
        sortOrder: i * 10,
        enabled: it.enabled !== false,
        audience: normAudience(it.audience),
      }));
      this.setData({ saving: true });
      const self = this;
      return aiDrawerAdmin
        .saveCapabilities(items)
        .then(() => {
          self.setData({ saving: false, editing: false });
          self._toast(self.data.savedText, 'success');
          self.loadContent();
        })
        .catch((err) => {
          self.setData({ saving: false });
          self._toast(failMessage(self.data.saveFailText, err), 'none');
        });
    },

    _toast(title, icon) {
      try {
        wx.showToast({ title: title, icon: icon || 'none' });
      } catch (e) {
        /* 提示失败不影响主流程 */
      }
    },

    /** 吃掉面板空白处的 touchmove，挡住穿透滚动（与抽屉同一做法）。 */
    noop() {},
  },
});

/** 文案编辑行：优先用管理端口给的中文名 `label`，没有就退化显示键本身（不硬编码中文映射）。 */
function buildCopyRowsFromAdmin(list) {
  return (Array.isArray(list) ? list : []).map((c) => {
    const key = c && c.key != null ? String(c.key) : '';
    const label = c && c.label ? String(c.label) : key;
    const raw = c && c.value;
    const value = typeof raw === 'string' ? raw : String(raw == null ? '' : raw);
    return { key: key, label: label, value: value, origValue: value };
  });
}

function indexOf(e) {
  const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
  const i = parseInt(ds.index, 10);
  return isNaN(i) ? -1 : i;
}

function failMessage(prefix, err) {
  const reason = err && err.message ? String(err.message) : '';
  return reason ? prefix + '：' + reason : prefix;
}
