// utils/request.js — 直连 JTU（aro.shsmu.edu.cn/jtu/api）。
// 新闻主路径：utils/aroNewsApi.js 优先 Spring；失败或正文为空时用本工具回退直连（富文本内图片等不经云函数）。
const baseUrl = "https://aro.shsmu.edu.cn/jtu/api"; // 这里改你的接口域名

function request(options) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';
    wx.request({
      url: baseUrl + options.url,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json",
        "token": token  // 自动带上
      },
      success: (res) => {
        resolve(res.data);
        console.log(res.data);
      },
      fail: (err) => {
        reject(err);
      },
    });
  });
}

module.exports = {
  request: request,
};