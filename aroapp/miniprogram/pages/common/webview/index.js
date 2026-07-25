// Simple webview page — reads `url` param and loads it
Page({
  data: { url: '' },
  onLoad(options) {
    const raw = options.url ? decodeURIComponent(options.url) : '';
    this.setData({ url: raw || 'https://sct.ftqq.com/' });
  },
});
