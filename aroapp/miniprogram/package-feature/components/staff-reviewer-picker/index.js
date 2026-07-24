const springAuth = require('../../../utils/springAuth.js');

function parseReviewerIds(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

function displayName(r) {
  if (!r) return '';
  return r.displayNickname || r.username || r.id || '';
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    value: { type: String, value: '[]' },
    placeholder: { type: String, value: '点击选择审核人…' },
  },

  data: {
    panelOpen: false,
    loading: false,
    loadError: '',
    search: '',
    reviewers: [],
    filtered: [],
    selectedTags: [],
    selectedIds: [],
  },

  observers: {
    'value, reviewers': function () {
      this.syncSelectedTags();
      if (this.data.panelOpen) {
        this.applyFilter(this.data.search);
      }
    },
  },

  lifetimes: {
    attached() {
      this.loadReviewers(false);
    },
  },

  methods: {
    syncSelectedTags() {
      const ids = parseReviewerIds(this.properties.value);
      const map = {};
      (this.data.reviewers || []).forEach((r) => {
        map[String(r.id)] = displayName(r);
      });
      const selectedTags = ids.map((id) => ({
        id,
        label: map[id] || id,
      }));
      this.setData({ selectedTags, selectedIds: ids });
    },

    buildFiltered(reviewers, search, selectedIds) {
      const q = (search || '').trim().toLowerCase();
      const selectedSet = new Set(selectedIds || []);
      let list = reviewers || [];
      if (q) {
        list = list.filter((r) => {
          const name = displayName(r).toLowerCase();
          const id = String(r.id || '').toLowerCase();
          const username = String(r.username || '').toLowerCase();
          return name.includes(q) || id.includes(q) || username.includes(q);
        });
      }
      return list.map((r) => ({
        ...r,
        _selected: selectedSet.has(String(r.id)),
      }));
    },

    applyFilter(search) {
      const filtered = this.buildFiltered(
        this.data.reviewers,
        search,
        parseReviewerIds(this.properties.value),
      );
      this.setData({ filtered });
    },

    async loadReviewers(showError) {
      if (this._loadingReviewers) return;
      this._loadingReviewers = true;
      this.setData({ loading: true, loadError: '' });
      try {
        const res = await springAuth.springRequest({
          url: '/api/material/admin/eligible-reviewers',
          method: 'GET',
          data: {},
        });
        let body = res.data;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (_) {
            body = null;
          }
        }
        if (!body || body.success !== true) {
          throw new Error((body && body.message) || '加载审核人失败');
        }
        const reviewers = (Array.isArray(body.data) ? body.data : []).map((r) => ({
          ...r,
          id: String(r.id || ''),
        }));
        this.setData({ reviewers }, () => {
          this.applyFilter(this.data.search);
          this.syncSelectedTags();
        });
      } catch (e) {
        const msg = (e && e.message) || '加载审核人失败';
        this.setData({ loadError: msg });
        if (showError) {
          wx.showToast({ title: msg, icon: 'none' });
        }
      } finally {
        this._loadingReviewers = false;
        this.setData({ loading: false });
      }
    },

    togglePanel() {
      const nextOpen = !this.data.panelOpen;
      this.setData({ panelOpen: nextOpen, search: '', loadError: '' }, () => {
        if (nextOpen) {
          if (!this.data.reviewers.length) {
            this.loadReviewers(true);
          } else {
            this.applyFilter('');
          }
        }
      });
    },

    closePanel() {
      this.setData({ panelOpen: false, search: '' }, () => this.applyFilter(''));
    },

    onSearchInput(e) {
      const search = e.detail.value || '';
      this.setData({ search });
      this.applyFilter(search);
    },

    emitValue(ids) {
      this.syncSelectedTagsFromIds(ids);
      this.applyFilter(this.data.search);
      this.triggerEvent('change', { value: JSON.stringify(ids) });
    },

    syncSelectedTagsFromIds(ids) {
      const map = {};
      (this.data.reviewers || []).forEach((r) => {
        map[String(r.id)] = displayName(r);
      });
      const selectedTags = ids.map((id) => ({
        id,
        label: map[id] || id,
      }));
      this.setData({ selectedTags, selectedIds: ids });
    },

    toggleReviewer(e) {
      const id = String(e.currentTarget.dataset.id || '');
      if (!id) return;
      const ids = [...(this.data.selectedIds.length ? this.data.selectedIds : parseReviewerIds(this.properties.value))];
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      this.emitValue(next);
    },

    removeTag(e) {
      const id = String(e.currentTarget.dataset.id || '');
      if (!id) return;
      const ids = [...(this.data.selectedIds.length ? this.data.selectedIds : parseReviewerIds(this.properties.value))];
      this.emitValue(ids.filter((x) => x !== id));
    },
  },
});
