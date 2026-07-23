const aroNewsApi = require('../../../utils/aroNewsApi.js');

Page({
  data: {
    newsList: [],
    loading: true
  },

  onLoad() {
    this.getNewsList();
  },

  async getNewsList() {
    try {
      const newsList = await aroNewsApi.fetchNewsList();
      this.setData({
        newsList,
        loading: false,
      });
    } catch (err) {
      console.warn('[allnews]', err);
      this.setData({ loading: false });
    }
  },

  // 跳转详情
  toDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/package-feature/pages/newsDetail/newsDetail?id=" + id,
    });
  }
});