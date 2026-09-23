const exemptUtil = require('../../utils/exemptDurationPresets.js');
const api = require('../../utils/dahuaIssueApi.js');

Component({
  properties: {
    show: { type: Boolean, value: false },
    cardNo: { type: String, value: '' },
    userName: { type: String, value: '' },
    aroUserId: { type: String, value: '' },
    submitting: { type: Boolean, value: false },
  },

  data: {
    mode: 'TIME',
    maxCount: '',
    untilTime: exemptUtil.DEFAULT_EXEMPT_UNTIL_TIME,
    rooms: [],
    roomsLoading: false,
    modeOptions: exemptUtil.EXEMPT_MODE_OPTIONS,
    untilPresets: exemptUtil.EXEMPT_UNTIL_TIME_PRESETS,
    defaultUntilTime: exemptUtil.DEFAULT_EXEMPT_UNTIL_TIME,
    canSubmit: false,
  },

  observers: {
    'show, aroUserId'(show, aroUserId) {
      if (!show) return;
      this.setData({
        mode: 'TIME',
        maxCount: '',
        untilTime: exemptUtil.DEFAULT_EXEMPT_UNTIL_TIME,
        rooms: [],
      });
      if (aroUserId) {
        this.loadRooms();
      } else {
        this.updateCanSubmit();
      }
    },
    'mode, maxCount, rooms'(mode, maxCount, rooms) {
      this.updateCanSubmit();
    },
  },

  methods: {
    updateCanSubmit() {
      const { mode, maxCount, rooms } = this.data;
      const selected = (rooms || []).filter((r) => r.selected);
      let ok = selected.length > 0;
      if (mode === 'COUNT' || mode === 'BOTH') {
        const raw = String(maxCount ?? '').trim();
        const n = parseInt(raw, 10);
        ok = ok && raw !== '' && !Number.isNaN(n) && n >= 1;
      }
      this.setData({ canSubmit: ok });
    },

    onClose() {
      this.triggerEvent('close');
    },

    onModeTap(e) {
      const mode = e.currentTarget.dataset.value;
      if (!mode) return;
      this.setData({ mode });
    },

    onMaxCountInput(e) {
      const raw = e.detail != null ? String(e.detail) : '';
      this.setData({ maxCount: raw });
    },

    onRoomToggle(e) {
      const roomId = e.currentTarget.dataset.id;
      if (!roomId) return;
      const rooms = (this.data.rooms || []).map((r) =>
        r.roomId === roomId ? { ...r, selected: !r.selected } : r,
      );
      this.setData({ rooms }, () => this.updateCanSubmit());
    },

    onRefreshRooms() {
      this.loadRooms();
    },

    async loadRooms() {
      const aroUserId = (this.properties.aroUserId || '').trim();
      if (!aroUserId) {
        this.setData({ rooms: [] });
        return;
      }
      this.setData({ roomsLoading: true });
      try {
        const prefill = await api.fetchIssueAccessPrefill(aroUserId);
        const rooms = exemptUtil.parseOfficialRooms(prefill);
        this.setData({ rooms });
      } catch (e) {
        this.setData({ rooms: [] });
      } finally {
        this.setData({ roomsLoading: false });
        this.updateCanSubmit();
      }
    },

    selectedRoomIdsJson() {
      const selected = (this.data.rooms || []).filter(function (r) { return r.selected; });
      const items = selected.map(function (r) {
        return { roomId: r.roomId, roomName: r.roomName };
      });
      return items.length ? JSON.stringify(items) : null;
    },

    emitConfirm(extendUntilTime) {
      const { mode, maxCount } = this.data;
      const roomIds = this.selectedRoomIdsJson();
      const selected = (this.data.rooms || []).filter((r) => r.selected);
      if (!selected.length) {
        wx.showToast({ title: '请至少选择一个授权房间', icon: 'none' });
        return;
      }
      if ((mode === 'COUNT' || mode === 'BOTH')) {
        const raw = String(maxCount ?? '').trim();
        const n = parseInt(raw, 10);
        if (!raw || Number.isNaN(n) || n < 1) {
          wx.showToast({ title: '请填写可用次数', icon: 'none' });
          return;
        }
      }
      const parsedMax = mode !== 'TIME'
        ? parseInt(String(maxCount ?? '').trim(), 10)
        : undefined;
      const until = extendUntilTime || this.data.untilTime || exemptUtil.DEFAULT_EXEMPT_UNTIL_TIME;
      this.triggerEvent('confirm', {
        extendUntilTime: mode === 'TIME' || mode === 'BOTH' ? until : undefined,
        mode,
        maxCount: mode !== 'TIME' ? parsedMax : undefined,
        roomIds,
      });
    },

    onUntilTap(e) {
      const untilTime = e.currentTarget.dataset.until;
      if (!untilTime) return;
      this.setData({ untilTime });
    },

    onConfirm() {
      const { mode, untilTime } = this.data;
      const until = untilTime || exemptUtil.DEFAULT_EXEMPT_UNTIL_TIME;
      this.emitConfirm(mode === 'BOTH' || mode === 'TIME' ? until : undefined);
    },
  },
});
