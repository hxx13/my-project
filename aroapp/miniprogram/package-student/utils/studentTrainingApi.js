/**
 * 学生端「培训报名 / 答题」接口与状态口径（小程序直连 Spring，Bearer 走本地 token）。
 * 状态口径与网页端一致：审批 testYn 与 评分 testFraction 双通过才算「已通过」。
 */
const springAuth = require('../../utils/springAuth.js');

function unwrap(body) {
  const data = body && typeof body === 'object' ? body : {};
  if (data.success === true || Number(data.code) === 200) return data.data;
  throw new Error(data.message || data.msg || '请求失败');
}

function isFullyPassed(testYn, testFraction) {
  return testYn === 1 && testFraction === 1;
}

function isRejected(testYn, testFraction) {
  return testYn === 2 || testFraction === 2;
}

/** 未报名 / 待审核 / 已通过 / 已拒绝 */
function enrollStatus(enrolled, testYn, testFraction) {
  if (!enrolled) return '未报名';
  if (isFullyPassed(testYn, testFraction)) return '已通过';
  if (isRejected(testYn, testFraction)) return '已拒绝';
  return '待审核';
}

/** 状态 → 标签样式类后缀（ok / warn / danger / muted） */
function statusTone(status) {
  if (status === '已通过') return 'ok';
  if (status === '已拒绝') return 'danger';
  if (status === '待审核') return 'warn';
  return 'muted';
}

/** 单个场次上我能做什么：enroll / cancel / reapply / none */
function enrollAction(occ) {
  if (!occ) return 'none';
  if (!occ.enrolled || !occ.enrollmentId) return 'enroll';
  if (isFullyPassed(occ.testYn, occ.testFraction)) return 'none';
  return isRejected(occ.testYn, occ.testFraction) ? 'reapply' : 'cancel';
}

async function fetchMyTrainings() {
  const res = await springAuth.springRequest({ url: '/api/student/training', method: 'GET', data: {} });
  return unwrap(res.data) || [];
}

async function enrollOccurrence(occurrenceId) {
  const res = await springAuth.springRequest({
    url: `/api/student/training/occurrences/${occurrenceId}/enroll`,
    method: 'POST',
    data: {},
  });
  return unwrap(res.data);
}

async function fetchMyEnrollments() {
  const res = await springAuth.springRequest({ url: '/api/student/training/my', method: 'GET', data: {} });
  return unwrap(res.data) || [];
}

async function cancelEnrollment(enrollmentId) {
  const res = await springAuth.springRequest({
    url: `/api/student/training/enrollments/${enrollmentId}`,
    method: 'DELETE',
    data: {},
  });
  return unwrap(res.data);
}

async function fetchMyExamPapers() {
  const res = await springAuth.springRequest({ url: '/api/student/exam/papers', method: 'GET', data: {} });
  return unwrap(res.data) || [];
}

async function fetchMyExamPaper(paperId) {
  const res = await springAuth.springRequest({
    url: `/api/student/exam/papers/${paperId}`,
    method: 'GET',
    data: {},
  });
  return unwrap(res.data);
}

async function submitExamPaper(paperId, answers) {
  const res = await springAuth.springRequest({
    url: `/api/student/exam/papers/${paperId}/submit`,
    method: 'POST',
    data: { answers: answers || {} },
  });
  return unwrap(res.data);
}

/** 我的培训证书：{ list, templates }。templates 是证书正文的唯一来源（后端给）。 */
async function fetchMyCertificates() {
  const res = await springAuth.springRequest({
    url: '/api/student/training/certificates',
    method: 'GET',
    data: {},
  });
  const d = unwrap(res.data);
  return d || { list: [], templates: [] };
}

/** 下载证书 PDF 到本地临时文件，返回可交给 wx.openDocument 的路径。 */
async function downloadCertificatePdf(id) {
  const res = await springAuth.springRequestBinary(`/api/student/training/certificates/${id}/pdf`, {
    errorMessage: '证书下载失败',
  });
  const fs = wx.getFileSystemManager();
  // 文件名带时间戳：同一张证书连点两次会并发写同一路径，第二次报 EBUSY
  const path = `${wx.env.USER_DATA_PATH}/certificate-${id}-${Date.now()}.pdf`;
  fs.writeFileSync(path, res.data);
  pruneOldCertificates(path);
  return path;
}

/** 清理上次预览留下的临时 PDF（正在被阅读器打开的那个删不掉，失败就跳过）。 */
function pruneOldCertificates(keepPath) {
  try {
    const fs = wx.getFileSystemManager();
    const keep = keepPath.split('/').pop();
    fs.readdirSync(wx.env.USER_DATA_PATH).forEach((name) => {
      if (name.indexOf('certificate-') !== 0 || name === keep) return;
      try {
        fs.unlinkSync(`${wx.env.USER_DATA_PATH}/${name}`);
      } catch (e) {
        // 文件仍被占用，下次再说
      }
    });
  } catch (e) {
    // 清理失败不影响查看
  }
}

/** 用系统能力打开 PDF（微信原生预览，带右上角菜单可转发/保存） */
function openPdfFile(filePath) {
  wx.openDocument({
    filePath: filePath,
    fileType: 'pdf',
    showMenu: true,
    fail: function () {
      wx.showToast({ title: '打开失败', icon: 'none' });
    },
  });
}

module.exports = {
  isFullyPassed,
  isRejected,
  enrollStatus,
  statusTone,
  enrollAction,
  fetchMyTrainings,
  enrollOccurrence,
  fetchMyEnrollments,
  cancelEnrollment,
  fetchMyExamPapers,
  fetchMyExamPaper,
  submitExamPaper,
  fetchMyCertificates,
  downloadCertificatePdf,
  openPdfFile,
};
