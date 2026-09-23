const scanDelayAutoApi = require('../../utils/scanDelayAutoApproveApi.js');
const materialAutoApi = require('../../utils/materialAutoApproveApi.js');
const {
  DEFAULT_DAILY_TIME,
  timeToDailyCron,
  dailyCronToTime,
} = require('../../utils/autoApproveScheduleTime.js');
const norm = require('../../utils/autoApproveNormalize.js');

function emptyTrustForm() {
  return {
    id: null,
    subjectUserId: '',
    subjectDisplayName: '',
    selectedKey: '',
    dimensionId: 0,
    roomId: '',
    triggerMode: 'ON_SUBMIT',
    scheduleCron: timeToDailyCron(DEFAULT_DAILY_TIME),
    note: '',
  };
}

function emptyBatchForm() {
  return {
    id: null,
    name: '批量自动审批',
    scheduleCron: timeToDailyCron(DEFAULT_DAILY_TIME),
    maxPerRun: 20,
  };
}

function isMaterial(kind) {
  return kind === 'material';
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    kind: { type: String, value: 'scanDelay' },
  },

  data: {
    subTab: 'trust',
    loading: false,
    saving: false,
    running: false,
    panelTitle: '自动审批',
    panelTip: '',
    dimensionFieldLabel: '延迟选项（事件节点）',
    trustForm: emptyTrustForm(),
    batchForm: emptyBatchForm(),
    candidateLabels: ['请选择姓名（自动锁定 ID 与维度）'],
    candidateIndex: 0,
    dimensionLabels: ['请选择'],
    dimensionIndex: 0,
    triggerModeLabels: ['提交时立即尝试', '定时审批'],
    triggerModeValues: ['ON_SUBMIT', 'SCHEDULED'],
    triggerModeIndex: 0,
    trustScheduleTime: DEFAULT_DAILY_TIME,
    batchScheduleTime: DEFAULT_DAILY_TIME,
    dimensionOptions: [],
    trustRulesOnSubmit: [],
    trustRulesScheduled: [],
    batchRules: [],
    suggestions: [],
  },

  observers: {
    'visible, kind'(visible, kind) {
      if (visible) {
        this.setData({
          panelTitle: isMaterial(kind) ? '物资自动审批' : '延迟自动审批',
          panelTip: isMaterial(kind)
            ? '从待审或历史记录选择姓名即可锁定申请人；也可手动选择物资（事件节点）。按人规则须手动保存。'
            : '从待审或历史记录选择姓名即可锁定申请人；也可手动选择延迟选项（事件节点）。按人规则须手动保存。',
          dimensionFieldLabel: isMaterial(kind) ? '物资（事件节点）' : '延迟选项（事件节点）',
          subTab: 'trust',
          trustForm: emptyTrustForm(),
          batchForm: emptyBatchForm(),
        });
        this.syncTrustPickers(emptyTrustForm());
        this.syncBatchPickers(emptyBatchForm());
        this.loadAll();
        this.loadSuggestions();
      } else {
        this._candidatesRaw = [];
      }
    },
  },

  methods: {
    getClient() {
      return isMaterial(this.properties.kind) ? materialAutoApi : scanDelayAutoApi;
    },

    syncTrustPickers(trustForm) {
      const triggerModeIndex = Math.max(0, this.data.triggerModeValues.indexOf(trustForm.triggerMode || 'ON_SUBMIT'));
      this.setData({
        trustForm,
        trustScheduleTime: dailyCronToTime(trustForm.scheduleCron),
        triggerModeIndex,
      });
      this.syncDimensionPicker(trustForm.dimensionId);
      this.syncCandidatePicker(trustForm.selectedKey);
    },

    syncBatchPickers(batchForm) {
      this.setData({
        batchForm,
        batchScheduleTime: dailyCronToTime(batchForm.scheduleCron),
      });
    },

    syncDimensionPicker(dimensionId) {
      const opts = this.data.dimensionOptions || [];
      let dimensionIndex = 0;
      if (dimensionId > 0) {
        const idx = opts.findIndex((o) => Number(o.id) === Number(dimensionId));
        dimensionIndex = idx >= 0 ? idx + 1 : 0;
      }
      const dimensionLabels = ['请选择'].concat(opts.map((o) => o.label));
      this.setData({ dimensionLabels, dimensionIndex });
    },

    syncCandidatePicker(selectedKey) {
      const list = this._candidatesRaw || [];
      const candidateLabels = ['请选择姓名（自动锁定 ID 与维度）'].concat(list.map((c) => c.pickerLabel));
      let candidateIndex = 0;
      if (selectedKey) {
        const idx = list.findIndex((c) => c.key === selectedKey);
        candidateIndex = idx >= 0 ? idx + 1 : 0;
      }
      this.setData({ candidateLabels, candidateIndex });
    },

    async loadAll() {
      this.setData({ loading: true });
      try {
        const client = this.getClient();
        const kind = this.properties.kind;
        const reqs = [
          client.fetchTrustRules(),
          client.fetchBatchRules(),
          isMaterial(kind) ? client.fetchAdminMaterialItems() : client.fetchScanDelayOptions(),
          client.fetchCandidates(),
        ];
        const results = await Promise.all(reqs);
        const trustRaw = results[0] || [];
        const batchRaw = results[1] || [];
        const dimensionRaw = results[2] || [];
        const candidateRaw = results[3] || [];

        const dimensionOptions = norm.buildDimensionOptions(dimensionRaw, kind, []);
        const labelMap = norm.labelMapFromDimensions(dimensionOptions);

        let trustRules = [];
        let batchRules = [];
        if (isMaterial(kind)) {
          trustRules = trustRaw.map(norm.normalizeMaterialTrustRule);
          batchRules = batchRaw.map((r) => norm.normalizeMaterialBatchRule(r, labelMap));
        } else {
          trustRules = trustRaw.map(norm.normalizeScanDelayTrustRule);
          batchRules = batchRaw.map((r) => norm.normalizeScanDelayBatchRule(r, labelMap));
        }

        this._candidatesRaw = isMaterial(kind)
          ? candidateRaw.map(norm.normalizeMaterialCandidate)
          : candidateRaw.map(norm.normalizeScanDelayCandidate);
        this._dimensionRaw = dimensionRaw;

        this.setData({
          dimensionOptions,
          trustRulesOnSubmit: trustRules.filter((r) => r.triggerMode !== 'SCHEDULED'),
          trustRulesScheduled: trustRules.filter((r) => r.triggerMode === 'SCHEDULED'),
          batchRules,
        }, () => {
          this.syncCandidatePicker(this.data.trustForm.selectedKey);
          this.syncDimensionPicker(this.data.trustForm.dimensionId);
        });
      } catch (e) {
        wx.showToast({ title: e.message || '加载失败', icon: 'none' });
        this.triggerEvent('close');
      } finally {
        this.setData({ loading: false });
      }
    },

    async reloadRules() {
      try {
        const client = this.getClient();
        const kind = this.properties.kind;
        const [trustRaw, batchRaw] = await Promise.all([
          client.fetchTrustRules(),
          client.fetchBatchRules(),
        ]);
        const labelMap = norm.labelMapFromDimensions(this.data.dimensionOptions);
        let trustRules = [];
        let batchRules = [];
        if (isMaterial(kind)) {
          trustRules = trustRaw.map(norm.normalizeMaterialTrustRule);
          batchRules = batchRaw.map((r) => norm.normalizeMaterialBatchRule(r, labelMap));
        } else {
          trustRules = trustRaw.map(norm.normalizeScanDelayTrustRule);
          batchRules = batchRaw.map((r) => norm.normalizeScanDelayBatchRule(r, labelMap));
        }
        this.setData({
          trustRulesOnSubmit: trustRules.filter((r) => r.triggerMode !== 'SCHEDULED'),
          trustRulesScheduled: trustRules.filter((r) => r.triggerMode === 'SCHEDULED'),
          batchRules,
        });
      } catch (e) {
        wx.showToast({ title: e.message || '刷新规则失败', icon: 'none' });
      }
    },

    onSubTabChange(e) {
      const subTab = e.currentTarget.dataset.tab;
      if (!subTab || subTab === this.data.subTab) return;
      this.setData({ subTab });
    },

    onCandidatePick(e) {
      const idx = Number(e.detail.value);
      if (!idx) {
        this.syncTrustPickers({ ...this.data.trustForm, selectedKey: '', subjectUserId: '', subjectDisplayName: '' });
        return;
      }
      const raw = (this._candidatesRaw || [])[idx - 1];
      if (!raw) return;
      const kind = this.properties.kind;
      const dimensionId = isMaterial(kind) ? raw.itemId : raw.optionId;
      const note = this.data.trustForm.id
        ? this.data.trustForm.note
        : raw.approvedCount
          ? `历史已通过 ${raw.approvedCount} 次（须手动保存后生效）`
          : raw.pendingCount
            ? `当前待审 ${raw.pendingCount} 条`
            : '';
      const trustForm = {
        ...this.data.trustForm,
        selectedKey: raw.key,
        subjectUserId: raw.subjectUserId,
        subjectDisplayName: raw.subjectDisplayName || '',
        dimensionId,
        roomId: raw.roomId || '',
        note,
      };
      this.syncTrustPickers(trustForm);
    },

    onDimensionPick(e) {
      const idx = Number(e.detail.value);
      const opt = idx > 0 ? (this.data.dimensionOptions || [])[idx - 1] : null;
      const dimensionId = opt ? opt.id : 0;
      const kind = this.properties.kind;
      let selectedKey = this.data.trustForm.selectedKey;
      if (this.data.trustForm.subjectUserId && dimensionId > 0) {
        selectedKey = isMaterial(kind)
          ? norm.materialCandidateKey({ subjectUserId: this.data.trustForm.subjectUserId, itemId: dimensionId })
          : norm.scanDelayCandidateKey({
            subjectUserId: this.data.trustForm.subjectUserId,
            optionId: dimensionId,
            roomId: this.data.trustForm.roomId,
          });
      }
      this.syncTrustPickers({ ...this.data.trustForm, dimensionId, selectedKey });
    },

    onTriggerModePick(e) {
      const idx = Number(e.detail.value);
      const triggerMode = this.data.triggerModeValues[idx] || 'ON_SUBMIT';
      this.setData({
        triggerModeIndex: idx,
        trustForm: { ...this.data.trustForm, triggerMode },
      });
    },

    onTrustTimePick(e) {
      const time = e.detail.value || DEFAULT_DAILY_TIME;
      this.setData({
        trustScheduleTime: time,
        trustForm: { ...this.data.trustForm, scheduleCron: timeToDailyCron(time) },
      });
    },

    onBatchTimePick(e) {
      const time = e.detail.value || DEFAULT_DAILY_TIME;
      this.setData({
        batchScheduleTime: time,
        batchForm: { ...this.data.batchForm, scheduleCron: timeToDailyCron(time) },
      });
    },

    onTrustNoteInput(e) {
      this.setData({ trustForm: { ...this.data.trustForm, note: e.detail.value } });
    },

    onBatchNameInput(e) {
      this.setData({ batchForm: { ...this.data.batchForm, name: e.detail.value } });
    },

    onBatchMaxInput(e) {
      const maxPerRun = Number(e.detail.value) || 20;
      this.setData({ batchForm: { ...this.data.batchForm, maxPerRun } });
    },

    onToggleBatchDimension(e) {
      const id = Number(e.currentTarget.dataset.id);
      const dimensionOptions = (this.data.dimensionOptions || []).map((o) =>
        Number(o.id) === id ? { ...o, checked: !o.checked } : o,
      );
      this.setData({ dimensionOptions });
    },

    onClearTrustForm() {
      this.syncTrustPickers(emptyTrustForm());
    },

    onClearBatchForm() {
      const dimensionOptions = (this.data.dimensionOptions || []).map((o) => ({ ...o, checked: false }));
      this.setData({ dimensionOptions });
      this.syncBatchPickers(emptyBatchForm());
    },

    async onSaveTrustRule() {
      const f = this.data.trustForm;
      if (!f.subjectUserId) {
        wx.showToast({ title: '请从已有记录选择申请人', icon: 'none' });
        return;
      }
      if (!f.dimensionId || f.dimensionId <= 0) {
        wx.showToast({ title: isMaterial(this.properties.kind) ? '请选择物资' : '请选择延迟选项', icon: 'none' });
        return;
      }
      this.setData({ saving: true });
      try {
        const body = {
          id: f.id || undefined,
          subjectUserId: f.subjectUserId,
          enabled: true,
          triggerMode: f.triggerMode || 'ON_SUBMIT',
          scheduleCron: f.triggerMode === 'SCHEDULED' ? (f.scheduleCron || timeToDailyCron(DEFAULT_DAILY_TIME)) : null,
          note: f.note || undefined,
        };
        if (isMaterial(this.properties.kind)) body.itemId = f.dimensionId;
        else {
          body.optionId = f.dimensionId;
          body.roomId = f.roomId ? f.roomId : null;
        }
        await this.getClient().saveTrustRule(body);
        // 保存后仅刷新规则列表，禁止整页 load；post-save-no-full-refresh.mdc
        await this.reloadRules();
        this.syncTrustPickers(emptyTrustForm());
        wx.showToast({ title: '按人规则已保存', icon: 'success' });
      } catch (e) {
        wx.showToast({ title: e.message || '保存失败', icon: 'none' });
      } finally {
        this.setData({ saving: false });
      }
    },

    async onSaveBatchRule() {
      const f = this.data.batchForm;
      const selectedIds = (this.data.dimensionOptions || []).filter((o) => o.checked).map((o) => o.id);
      if (!selectedIds.length) {
        wx.showToast({
          title: isMaterial(this.properties.kind) ? '至少选择一个物资' : '至少选择一个延迟选项',
          icon: 'none',
        });
        return;
      }
      this.setData({ saving: true });
      try {
        const body = {
          id: f.id || undefined,
          name: (f.name || '').trim() || '批量自动审批',
          enabled: true,
          scheduleCron: f.scheduleCron || timeToDailyCron(DEFAULT_DAILY_TIME),
          maxPerRun: f.maxPerRun || 20,
          onlyIfReviewerMatch: true,
        };
        if (isMaterial(this.properties.kind)) body.itemIds = selectedIds;
        else body.optionIds = selectedIds;
        await this.getClient().saveBatchRule(body);
        await this.reloadRules();
        this.onClearBatchForm();
        wx.showToast({ title: '批量规则已保存', icon: 'success' });
      } catch (e) {
        wx.showToast({ title: e.message || '保存失败', icon: 'none' });
      } finally {
        this.setData({ saving: false });
      }
    },

    onEditTrustRule(e) {
      const id = Number(e.currentTarget.dataset.id);
      const all = (this.data.trustRulesOnSubmit || []).concat(this.data.trustRulesScheduled || []);
      const rule = all.find((r) => Number(r.id) === id);
      if (!rule) return;
      const trustForm = {
        id: rule.id,
        subjectUserId: rule.subjectUserId,
        subjectDisplayName: rule.subjectDisplayName || '',
        selectedKey: rule.selectedKey || '',
        dimensionId: isMaterial(this.properties.kind) ? rule.itemId : rule.optionId,
        roomId: rule.roomId || '',
        triggerMode: rule.triggerMode || 'ON_SUBMIT',
        scheduleCron: rule.scheduleCron || timeToDailyCron(DEFAULT_DAILY_TIME),
        note: rule.note || '',
      };
      this.setData({ subTab: 'trust' });
      this.syncTrustPickers(trustForm);
    },

    onEditBatchRule(e) {
      const id = Number(e.currentTarget.dataset.id);
      const rule = (this.data.batchRules || []).find((r) => Number(r.id) === id);
      if (!rule) return;
      const selectedIds = isMaterial(this.properties.kind) ? rule.itemIds : rule.optionIds;
      const dimensionOptions = norm.buildDimensionOptions(this._dimensionRaw || [], this.properties.kind, selectedIds);
      const batchForm = {
        id: rule.id,
        name: rule.name,
        scheduleCron: rule.scheduleCron || timeToDailyCron(DEFAULT_DAILY_TIME),
        maxPerRun: rule.maxPerRun || 20,
      };
      this.setData({ subTab: 'batch', dimensionOptions, batchForm });
      this.syncBatchPickers(batchForm);
    },

    onDeleteTrustRule(e) {
      const id = Number(e.currentTarget.dataset.id);
      if (!id) return;
      wx.showModal({
        title: '删除规则',
        content: '确定删除此按人规则？',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await this.getClient().deleteTrustRule(id);
            await this.reloadRules();
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        },
      });
    },

    onDeleteBatchRule(e) {
      const id = Number(e.currentTarget.dataset.id);
      if (!id) return;
      wx.showModal({
        title: '删除规则',
        content: '确定删除此批量规则？',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await this.getClient().deleteBatchRule(id);
            await this.reloadRules();
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        },
      });
    },

    async onApplySuggestion(e) {
      const idx = Number(e.currentTarget.dataset.idx);
      const s = (this.data.suggestions || [])[idx];
      if (!s || s.alreadyTrusted) return;
      wx.showLoading({ title: '保存中…', mask: true });
      try {
        if (isMaterial(this.properties.kind)) {
          await materialAutoApi.saveTrustRule({
            subjectUserId: s.subjectUserId,
            itemId: s.itemId,
            enabled: true,
            triggerMode: 'ON_SUBMIT',
            note: `历史已通过 ${s.approvedCount || 0} 次（建议预填）`,
          });
        } else {
          await scanDelayAutoApi.saveTrustRule({
            subjectUserId: s.subjectUserId,
            optionId: s.optionId,
            roomId: s.roomId || undefined,
            enabled: true,
            triggerMode: 'ON_SUBMIT',
            note: `历史已通过 ${s.approvedCount || 0} 次（建议预填）`,
          });
        }
        wx.showToast({ title: '规则已保存', icon: 'success' });
        await this.reloadRules();
        await this.loadSuggestions();
      } catch (err) {
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    async loadSuggestions() {
      try {
        const rows = await this.getClient().fetchSuggestions();
        const kind = this.properties.kind;
        const suggestions = (rows || []).slice(0, 20).map((s) => {
          const name = s.subjectDisplayName || s.subjectUserId || '';
          if (isMaterial(kind)) {
            return {
              ...s,
              label: `${name} · ${s.itemName || s.itemId || ''}（已通过 ${s.approvedCount || 0} 次）`,
            };
          }
          return {
            ...s,
            label: `${name} · ${s.optionLabel || s.optionId || ''}（已通过 ${s.approvedCount || 0} 次）`,
          };
        });
        this.setData({ suggestions });
      } catch (e) {
        this.setData({ suggestions: [] });
      }
    },

    async onRunNow() {
      if (this.data.running) return;
      this.setData({ running: true });
      wx.showLoading({ title: '执行中…', mask: true });
      try {
        const r = await this.getClient().runAutoApproveNow();
        wx.showToast({ title: `通过 ${r.approved || 0} 条`, icon: 'none' });
        await this.reloadRules();
        this.triggerEvent('runsuccess');
      } catch (e) {
        wx.showToast({ title: e.message || '执行失败', icon: 'none' });
      } finally {
        wx.hideLoading();
        this.setData({ running: false });
      }
    },

    onCloseTap() {
      this.triggerEvent('close');
    },

    noop() {},
  },
});
