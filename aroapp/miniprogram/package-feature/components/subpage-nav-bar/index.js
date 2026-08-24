const { readCustomNavMetrics } = require('../../../utils/customNavMetrics.js');

Component({
  properties: {
    title: { type: String, value: '' },
    showSwitch: { type: Boolean, value: false },
    switchLabel: { type: String, value: '切换' },
    customBack: { type: Boolean, value: false },
  },

  data: {
    statusBarHeight: 20,
    navContentHeight: 32,
    navBarHeight: 64,
  },

  lifetimes: {
    attached() {
      this.setData(readCustomNavMetrics());
    },
  },

  methods: {
    onBack() {
      if (this.data.customBack) {
        this.triggerEvent('back');
        return;
      }
      wx.navigateBack({
        delta: 1,
        fail: () => wx.switchTab({ url: '/pages/index/index' }),
      });
    },

    onSwitch() {
      this.triggerEvent('switch');
    },
  },
});
