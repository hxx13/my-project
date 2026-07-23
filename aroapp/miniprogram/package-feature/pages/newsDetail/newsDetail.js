/*
 * @Date: 2026-04-16 16:06:25
 * @LastEditTime: 2026-04-16 16:07:36
 * @FilePath: \aroapp\miniprogram\pages\newsDetail\newsDetail.js
 */
const aroNewsApi = require('../../../utils/aroNewsApi.js');

Page({
  data: {
    news: {}
  },

  onLoad(options) {
    const id = options.id;
    if (id) {
      this.getNewsDetail(id);
    }
  },

  // 获取详情
  async getNewsDetail(id) {
    try {
      wx.showLoading({ title: '加载中...' });
      const news = await aroNewsApi.fetchNewsDetail(id);
      this.setData({
        news: news || {},
      });
    } catch (err) {
      console.warn('[newsDetail]', err);
    } finally {
      wx.hideLoading();
    }
  },
});