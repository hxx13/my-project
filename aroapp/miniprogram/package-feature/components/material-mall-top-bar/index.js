Component({
  properties: {
    searchKeyword: { type: String, value: '' },
    placeholder: { type: String, value: '搜索' },
    showProcess: { type: Boolean, value: false },
    processBadge: { type: String, value: '' },
    showManage: { type: Boolean, value: false },
    showAdmin: { type: Boolean, value: false },
    mineBadge: { type: String, value: '' },
  },

  methods: {
    onSearchInput(e) {
      this.triggerEvent('searchinput', { value: (e.detail && e.detail.value) || '' });
    },
    onTapProcess() {
      this.triggerEvent('tapprocess');
    },
    onTapManage() {
      this.triggerEvent('tapmanage');
    },
    onTapMine() {
      this.triggerEvent('tapmine');
    },
    onTapAdmin() {
      this.triggerEvent('tapadmin');
    },
  },
});
