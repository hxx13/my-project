/**
 * 教职工端「培训管理」接口（小程序直连 Spring，Bearer 走本地 token）。
 * 覆盖：培训列表/详情、新建/编辑、发布/取消发布、场次、报名审核/评分、房间权限下放、类型预设、人员与房间字典。
 */
const springAuth = require('../../utils/springAuth.js');

function unwrap(body) {
  const data = body && typeof body === 'object' ? body : {};
  if (data.success === true || Number(data.code) === 200) return data.data;
  throw new Error(data.message || data.msg || '请求失败');
}

function req(url, method, data) {
  return springAuth
    .springRequest({ url: url, method: method || 'GET', data: data || {} })
    .then(function (res) {
      return unwrap(res.data);
    });
}

// ── 培训 ──
function fetchTrainings(params) {
  const p = params || {};
  const qs = [];
  if (p.page) qs.push('page=' + p.page);
  if (p.pageSize) qs.push('pageSize=' + p.pageSize);
  if (p.keyword) qs.push('keyword=' + encodeURIComponent(p.keyword));
  return req('/api/admin/training' + (qs.length ? '?' + qs.join('&') : ''), 'GET').then(function (d) {
    return d || { list: [], total: 0 };
  });
}

function fetchTraining(id) {
  return req('/api/admin/training/' + id, 'GET');
}

function createTraining(body) {
  return req('/api/admin/training', 'POST', body);
}

function updateTraining(id, body) {
  return req('/api/admin/training/' + id, 'PUT', body);
}

function publishTraining(id) {
  return req('/api/admin/training/' + id + '/publish', 'POST');
}

function unpublishTraining(id) {
  return req('/api/admin/training/' + id + '/unpublish', 'POST');
}

// ── 场次 ──
function addOccurrence(trainingId, body) {
  return req('/api/admin/training/' + trainingId + '/occurrences', 'POST', body);
}

function updateOccurrence(occurrenceId, body) {
  return req('/api/admin/training/occurrences/' + occurrenceId, 'PUT', body);
}

function deleteOccurrence(occurrenceId) {
  return req('/api/admin/training/occurrences/' + occurrenceId, 'DELETE');
}

// ── 报名审核 / 评分 / 房间 ──
function auditEnrollment(enrollmentId, state) {
  return req('/api/admin/training/enrollments/' + enrollmentId + '/audit', 'POST', { state: state });
}

function scoreEnrollment(enrollmentId, state) {
  return req('/api/admin/training/enrollments/' + enrollmentId + '/score', 'POST', { state: state });
}

function setEnrollmentRooms(enrollmentId, roomIds) {
  return req('/api/admin/training/enrollments/' + enrollmentId + '/rooms', 'POST', { roomIds: roomIds || [] });
}

// ── 字典 ──
function fetchTypePresets() {
  return req('/api/admin/training/type-presets', 'GET').then(function (d) {
    return d || [];
  });
}

function fetchLocations() {
  return req('/api/admin/training/locations', 'GET').then(function (d) {
    return d || [];
  });
}

/** 所属人候选：教职工账号（sys_user） */
function fetchSystemUsers(keyword) {
  const q = keyword ? '&keyword=' + encodeURIComponent(keyword) : '';
  return req('/api/admin/system-users?page=1&size=200' + q, 'GET').then(function (d) {
    const rows = d && Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
    return rows.map(function (r) {
      return {
        id: String(r.id),
        name: r.displayNickname || r.username || String(r.id),
        jobNumber: r.username || '',
      };
    });
  });
}

/** 房间字典（含区域/楼层），用于下放房间权限 */
function fetchRooms() {
  return req('/api/v1/room-mapping/rooms?pageSize=10000&includeChannels=false', 'GET').then(function (d) {
    const list = (d && d.list) || [];
    return list
      .filter(function (r) {
        return r && r.roomId;
      })
      .map(function (r) {
        return {
          roomId: String(r.roomId),
          name: r.roomName || String(r.roomId),
          region: r.regionName || '其他',
          floor: r.floorName || '其他',
        };
      });
  });
}

module.exports = {
  fetchTrainings: fetchTrainings,
  fetchTraining: fetchTraining,
  createTraining: createTraining,
  updateTraining: updateTraining,
  publishTraining: publishTraining,
  unpublishTraining: unpublishTraining,
  addOccurrence: addOccurrence,
  updateOccurrence: updateOccurrence,
  deleteOccurrence: deleteOccurrence,
  auditEnrollment: auditEnrollment,
  scoreEnrollment: scoreEnrollment,
  setEnrollmentRooms: setEnrollmentRooms,
  fetchTypePresets: fetchTypePresets,
  fetchLocations: fetchLocations,
  fetchSystemUsers: fetchSystemUsers,
  fetchRooms: fetchRooms,
};
