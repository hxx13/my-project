/**
 * 小程序版本更新公告：GET /api/mp/releases/splash（首屏弹窗，与扫码弹窗公告分离）
 */
const springAuth = require('./springAuth.js');
const { applyRichTextTypography } = require('./richTextTypography.js');

var DISMISS_STORAGE_KEY = 'mp_splash_release_dismissed_id';

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function decodeHtmlEntitiesIfNeeded(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (!text || text.indexOf('&') < 0) return text;
  if (text.indexOf('<') >= 0 && text.indexOf('&lt;') < 0) return text;
  return text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function normalizeContentHtml(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    if (typeof raw.html === 'string') return decodeHtmlEntitiesIfNeeded(raw.html);
    if (typeof raw.content === 'string') return decodeHtmlEntitiesIfNeeded(raw.content);
    return '';
  }
  return decodeHtmlEntitiesIfNeeded(String(raw));
}

function getDismissedReleaseId() {
  return String(wx.getStorageSync(DISMISS_STORAGE_KEY) || '').trim();
}

function markReleaseDismissed(releaseId) {
  var id = String(releaseId || '').trim();
  if (!id) return;
  wx.setStorageSync(DISMISS_STORAGE_KEY, id);
}

function shouldShowSplashRelease(release) {
  if (!release || !release.id) return false;
  return String(release.id) !== getDismissedReleaseId();
}

function fetchSplashRelease() {
  return springAuth.springRequest({
    url: '/api/mp/releases/splash',
    method: 'GET',
    data: {},
  }).then(function (res) {
    if (res.statusCode !== 200) {
      throw new Error('加载失败(' + (res.statusCode || 0) + ')');
    }
    var body = parseBody(res.data);
    if (!body || !body.success) {
      throw new Error((body && body.message) || '加载失败');
    }
    var data = body.data || {};
    var release = data.release || null;
    if (!release || !release.id) return null;
    return release;
  });
}

function prepareReleaseBodyHtml(release) {
  var html = normalizeContentHtml(release && release.bodyHtml);
  if (html) return applyRichTextTypography(html);
  var summary = String(release && release.summary || '').trim();
  if (!summary) return '';
  return applyRichTextTypography('<p>' + summary.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>');
}

module.exports = {
  DISMISS_STORAGE_KEY: DISMISS_STORAGE_KEY,
  getDismissedReleaseId: getDismissedReleaseId,
  markReleaseDismissed: markReleaseDismissed,
  shouldShowSplashRelease: shouldShowSplashRelease,
  fetchSplashRelease: fetchSplashRelease,
  prepareReleaseBodyHtml: prepareReleaseBodyHtml,
};
