/** 从工单描述中提取 http(s) 链接，便于一键复制（如淘宝链接） */
function extractHttpUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/[\w\-./?#&=%:+~]+/gi;
  const arr = String(text).match(re);
  if (!arr || !arr.length) return [];
  const cleaned = arr.map((u) => u.replace(/[。,.、]+$/, ''));
  return [...new Set(cleaned)];
}

module.exports = { extractHttpUrls };
