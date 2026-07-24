/**
 * 学生首页进出 / 豁免状态 — 与 H5 mobilePresenceTheme + useMobilePresenceStatus 对齐
 */

const PRESENCE_MAIN_THEME = {
  INSIDE: {
    label: '已进入',
    accent: '#07c160',
    accentSoft: 'rgba(7,193,96,0.14)',
    border: 'rgba(7,193,96,0.35)',
    cardBg: 'rgba(255,255,255,0.98)',
    iconBg: 'rgba(7,193,96,0.16)',
    badgeBg: '#07c160',
    badgeText: '#ffffff',
    roomNameColor: '#ac1736',
    iconName: 'passed',
  },
  OUTSIDE: {
    label: '已离开',
    accent: '#64748b',
    accentSoft: 'rgba(100,116,139,0.12)',
    border: 'rgba(100,116,139,0.28)',
    cardBg: 'rgba(255,255,255,0.98)',
    iconBg: 'rgba(148,163,184,0.2)',
    badgeBg: '#64748b',
    badgeText: '#ffffff',
    roomNameColor: '#64748b',
    iconName: 'revoke',
  },
  UNKNOWN: {
    label: '状态未知',
    accent: '#ed6a0c',
    accentSoft: 'rgba(237,106,12,0.12)',
    border: 'rgba(237,106,12,0.32)',
    cardBg: 'rgba(255,255,255,0.98)',
    iconBg: 'rgba(237,106,12,0.16)',
    badgeBg: '#ed6a0c',
    badgeText: '#ffffff',
    roomNameColor: '#c2410c',
    iconName: 'question-o',
  },
};

const PRESENCE_PENDING_THEME = {
  accent: '#ea580c',
  soft: 'rgba(234,88,12,0.1)',
  border: 'rgba(234,88,12,0.28)',
  text: '#c2410c',
};

const PRESENCE_AUTO_EXIT_THEME = {
  accent: '#ac1736',
  soft: 'rgba(172,23,54,0.1)',
  border: 'rgba(172,23,54,0.28)',
  text: '#9f1239',
};

const PRESENCE_DWELL_THEME = {
  accent: '#2563eb',
  soft: 'rgba(37,99,235,0.1)',
  border: 'rgba(37,99,235,0.22)',
  text: '#1d4ed8',
};

const EXEMPT_THEME = {
  pending_review: {
    badge: '待审核',
    accent: '#d97706',
    soft: 'rgba(217,119,6,0.1)',
    border: 'rgba(217,119,6,0.28)',
    text: '#b45309',
    iconName: 'clock-o',
  },
  approved_active: {
    badge: '已授权',
    accent: '#16a34a',
    soft: 'rgba(22,163,74,0.1)',
    border: 'rgba(22,163,74,0.28)',
    text: '#15803d',
    iconName: 'gem-o',
  },
  approved_expired: {
    badge: '已过期',
    accent: '#dc2626',
    soft: 'rgba(220,38,38,0.1)',
    border: 'rgba(220,38,38,0.28)',
    text: '#b91c1c',
    iconName: 'clock-o',
  },
  rejected: {
    badge: '已拒绝',
    accent: '#6b7280',
    soft: 'rgba(107,114,128,0.1)',
    border: 'rgba(107,114,128,0.28)',
    text: '#4b5563',
    iconName: 'close',
  },
};

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatCountdown(seconds) {
  if (seconds == null || seconds < 0) return '';
  var m = Math.floor(seconds / 60);
  var s = Math.floor(seconds % 60);
  return pad2(m) + ':' + pad2(s);
}

function formatElapsedDuration(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return '';
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  if (h > 0) return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  return pad2(m) + ':' + pad2(s);
}

function remainingSecondsFromScheduledAt(scheduledAt, nowMs) {
  var raw = (scheduledAt || '').trim();
  if (!raw) return null;
  var target = Date.parse(raw.replace(' ', 'T'));
  if (!isFinite(target)) return null;
  var rem = Math.ceil((target - (nowMs != null ? nowMs : Date.now())) / 1000);
  return rem > 0 ? rem : 0;
}

function hasActiveAutoSignoutCountdown(analyze) {
  if (!analyze) return false;
  var fromDeadline = remainingSecondsFromScheduledAt(analyze.autoSignoutScheduledAt);
  if (fromDeadline != null && fromDeadline > 0) return true;
  return (analyze.autoSignoutSecondsRemaining || 0) > 0;
}

function formatExemptRemaining(expireAt, nowMs) {
  if (!expireAt) return '';
  var t = Date.parse(String(expireAt).trim().replace(/-/g, '/').replace('T', ' '));
  if (!isFinite(t)) return '';
  var diffMs = t - (nowMs != null ? nowMs : Date.now());
  if (diffMs <= 0) return '已到期';
  var mins = Math.ceil(diffMs / 60000);
  if (mins < 60) return '剩余 ' + mins + ' 分钟';
  var hours = Math.floor(mins / 60);
  var rm = mins % 60;
  if (hours < 24) return rm > 0 ? '剩余 ' + hours + ' 小时 ' + rm + ' 分' : '剩余 ' + hours + ' 小时';
  var days = Math.floor(hours / 24);
  return '剩余 ' + days + ' 天';
}

function formatExpireClock(expireAt) {
  if (!expireAt) return '';
  var raw = String(expireAt).trim();
  if (raw.length >= 16) return raw.slice(11, 16);
  return raw.slice(-5);
}

function roomLabelFromPending(room) {
  var candidates = [room.displayName, room.name, room.roomName, room.officialRoomName];
  for (var i = 0; i < candidates.length; i++) {
    var text = String(candidates[i] || '').trim();
    if (text) return text;
  }
  return '';
}

function findSelfInOverview(overview, userId) {
  if (!userId) return null;
  var uid = String(userId).trim();
  for (var ri = 0; ri < (overview || []).length; ri++) {
    var room = overview[ri];
    var occs = room.occupants || [];
    for (var oi = 0; oi < occs.length; oi++) {
      var occ = occs[oi];
      var occUid = String(occ.userId || occ.user_id || '').trim();
      if (occUid === uid) {
        return {
          roomName: room.roomName || '未知房间',
          entryTime: occ.entryTime || occ.entry_time || null,
        };
      }
    }
  }
  return null;
}

function resolveInsideRoom(overview, userId, analyze) {
  var fromOverview = findSelfInOverview(overview, userId);
  var pending = Array.isArray(analyze.pendingRooms) ? analyze.pendingRooms : [];
  var pendingNames = [];
  var seen = {};
  for (var pi = 0; pi < pending.length; pi++) {
    var name = roomLabelFromPending(pending[pi]);
    if (name && !seen[name]) {
      seen[name] = true;
      pendingNames.push(name);
    }
  }
  if (fromOverview && fromOverview.roomName) {
    return {
      roomName: fromOverview.roomName,
      entryTime: fromOverview.entryTime,
    };
  }
  if (pendingNames.length > 0) {
    return {
      roomName: pendingNames.join('、'),
      entryTime: fromOverview ? fromOverview.entryTime : null,
    };
  }
  return { roomName: null, entryTime: fromOverview ? fromOverview.entryTime : null };
}

function decorateExemptStatus(exempt, nowMs) {
  if (!exempt || !exempt.phase || exempt.phase === 'none') return null;
  var copy = Object.assign({}, exempt);
  if (copy.phase === 'approved_active' && copy.expireAt) {
    var remaining = formatExemptRemaining(copy.expireAt, nowMs);
    if (remaining === '已到期') {
      copy.phase = 'approved_expired';
      copy.remainingText = '已到期';
    } else {
      copy.remainingText = remaining;
    }
  }
  return copy;
}

function buildExemptDetailLines(exempt) {
  if (!exempt) return { line1: '', line2: '' };
  if (exempt.phase === 'pending_review') {
    return {
      line1: exempt.extendUntilTime ? '延长至 ' + exempt.extendUntilTime : '',
      line2: '',
    };
  }
  if (exempt.phase === 'approved_active') {
    if (exempt.mode === 'COUNT') {
      if (exempt.maxCount == null) return { line1: '', line2: '' };
      var remainCount = Math.max(0, exempt.maxCount - (exempt.usedCount || 0));
      return {
        line1: '剩余 ' + remainCount + '/' + exempt.maxCount + ' 次',
        line2: '',
      };
    }
    if (exempt.mode === 'BOTH') {
      var timePart = exempt.remainingText || '';
      var countPart = exempt.maxCount != null
        ? '剩余 ' + Math.max(0, exempt.maxCount - (exempt.usedCount || 0)) + '/' + exempt.maxCount + ' 次'
        : '';
      return { line1: timePart, line2: countPart };
    }
    if (exempt.remainingText && exempt.expireAt) {
      return {
        line1: exempt.remainingText,
        line2: '至 ' + formatExpireClock(exempt.expireAt),
      };
    }
    return {
      line1: exempt.remainingText || '',
      line2: exempt.expireAt ? '至 ' + formatExpireClock(exempt.expireAt) : '',
    };
  }
  if (exempt.phase === 'approved_expired') {
    return {
      line1: '已到期',
      line2: exempt.expireAt ? '至 ' + formatExpireClock(exempt.expireAt) : '',
    };
  }
  return { line1: '', line2: '' };
}

function resolvePresenceDisplay(snapshot) {
  var currentState = snapshot.currentState || 'UNKNOWN';
  var inPendingActivation = snapshot.inPendingActivation;
  var inAutoExitScheduled = snapshot.inAutoExitScheduled;

  if (currentState === 'INSIDE') {
    if (inPendingActivation) {
      return {
        phase: 'pending_activation',
        theme: {
          label: '待激活',
          accent: PRESENCE_PENDING_THEME.accent,
          accentSoft: PRESENCE_PENDING_THEME.soft,
          border: PRESENCE_PENDING_THEME.border,
          cardBg: 'rgba(255,255,255,0.98)',
          iconBg: 'rgba(234,88,12,0.14)',
          badgeBg: PRESENCE_PENDING_THEME.accent,
          badgeText: '#ffffff',
          roomNameColor: '#c2410c',
          iconName: 'clock-o',
        },
      };
    }
    if (inAutoExitScheduled) {
      return {
        phase: 'pending_leave',
        theme: {
          label: '待离开',
          accent: PRESENCE_AUTO_EXIT_THEME.accent,
          accentSoft: PRESENCE_AUTO_EXIT_THEME.soft,
          border: PRESENCE_AUTO_EXIT_THEME.border,
          cardBg: 'rgba(255,255,255,0.98)',
          iconBg: 'rgba(172,23,54,0.14)',
          badgeBg: PRESENCE_AUTO_EXIT_THEME.accent,
          badgeText: '#ffffff',
          roomNameColor: '#9f1239',
          iconName: 'revoke',
        },
      };
    }
    return { phase: 'inside', theme: PRESENCE_MAIN_THEME.INSIDE };
  }
  if (currentState === 'OUTSIDE') {
    return { phase: 'outside', theme: PRESENCE_MAIN_THEME.OUTSIDE };
  }
  return { phase: 'unknown', theme: PRESENCE_MAIN_THEME.UNKNOWN };
}

/**
 * 从 room-dashboard + exempt-status 构建可本地 tick 的快照
 */
function buildPresenceFromDashboard(dash, exempt, nowMs) {
  var analyze = dash.analyze || {};
  var overview = dash.overview || [];
  var userId = dash.userId || '';
  var now = nowMs != null ? nowMs : Date.now();

  var rawState = (analyze.currentState || 'UNKNOWN').toUpperCase();
  var currentState = rawState === 'INSIDE' || rawState === 'OUTSIDE' ? rawState : 'UNKNOWN';

  var scheduledAt = analyze.autoSignoutScheduledAt || null;
  var countdownSeconds = null;
  if (hasActiveAutoSignoutCountdown(analyze)) {
    var fromDeadline = remainingSecondsFromScheduledAt(scheduledAt, now);
    countdownSeconds = fromDeadline != null && fromDeadline > 0
      ? fromDeadline
      : (analyze.autoSignoutSecondsRemaining > 0 ? analyze.autoSignoutSecondsRemaining : null);
  }

  var autoState = analyze.autoSignoutState || null;
  var inPendingActivation = autoState === 'PENDING_ACTIVATION' && (countdownSeconds || 0) > 0;
  var inAutoExitScheduled = autoState === 'AUTO_EXIT_SCHEDULED' && (countdownSeconds || 0) > 0;

  var insideRoom = currentState === 'INSIDE'
    ? resolveInsideRoom(overview, userId, analyze)
    : { roomName: null, entryTime: null };

  var entryMs = insideRoom.entryTime
    ? Date.parse(String(insideRoom.entryTime).replace(' ', 'T'))
    : null;
  var dwellSeconds = currentState === 'INSIDE' && entryMs != null && isFinite(entryMs)
    ? Math.max(0, Math.floor((now - entryMs) / 1000))
    : null;

  return {
    loading: false,
    currentState: currentState,
    roomName: insideRoom.roomName,
    dwellSeconds: dwellSeconds,
    autoSignoutState: autoState,
    autoSignoutScheduledAt: scheduledAt,
    countdownSeconds: countdownSeconds,
    inPendingActivation: inPendingActivation,
    inAutoExitScheduled: inAutoExitScheduled,
    exemptStatus: decorateExemptStatus(exempt, now),
  };
}

function buildPresenceViewModel(snapshot) {
  if (!snapshot || snapshot.loading) {
    return { loading: true };
  }

  var display = resolvePresenceDisplay(snapshot);
  var phase = display.phase;
  var theme = display.theme;
  var showRoomName = phase === 'inside' || phase === 'pending_activation' || phase === 'pending_leave';
  var roomName = showRoomName ? (snapshot.roomName || '同步中…') : '';
  var countdownUrgent = (snapshot.countdownSeconds || 0) > 0 && (snapshot.countdownSeconds || 0) <= 60;
  var countdownText = snapshot.countdownSeconds != null ? formatCountdown(snapshot.countdownSeconds) : '';
  var dwellText = phase === 'inside' && snapshot.dwellSeconds != null
    ? formatElapsedDuration(snapshot.dwellSeconds)
    : '';

  var exempt = snapshot.exemptStatus;
  var hasExemptRow = !!(exempt && exempt.phase && exempt.phase !== 'none');
  var exemptVm = {};
  if (hasExemptRow) {
    var exTheme = EXEMPT_THEME[exempt.phase] || EXEMPT_THEME.rejected;
    var roomNames = exempt.roomNames && exempt.roomNames.length > 0
      ? exempt.roomNames.join(' · ')
      : '—';
    var detailLines = buildExemptDetailLines(exempt);
    exemptVm = {
      hasExemptRow: true,
      exemptPhase: exempt.phase,
      exemptBadge: exTheme.badge,
      exemptRoomNames: exempt.phase === 'rejected' ? '已申请 · ' + roomNames + ' · 已拒绝' : roomNames,
      exemptDetailLine1: detailLines.line1,
      exemptDetailLine2: detailLines.line2,
      exemptAccent: exTheme.accent,
      exemptSoft: exTheme.soft,
      exemptBorder: exTheme.border,
      exemptText: exTheme.text,
      exemptIconName: exTheme.iconName,
    };
  }

  return Object.assign({
    loading: false,
    hasStudentPresence: true,
    presencePhase: phase,
    presenceLabel: theme.label,
    presenceRoomName: roomName,
    presenceShowRoomName: showRoomName,
    presenceDwellText: dwellText,
    presenceCountdownText: countdownText,
    presenceCountdownLabel: phase === 'pending_activation' ? '激活 ' : '签退 ',
    presenceCountdownUrgent: countdownUrgent,
    presenceShowDwell: phase === 'inside' && snapshot.dwellSeconds != null,
    presenceShowCountdown: (phase === 'pending_activation' || phase === 'pending_leave') && !!countdownText,
    presencePhaseOutside: phase === 'outside',
    presencePhaseUnknown: phase === 'unknown',
    presenceAccent: theme.accent,
    presenceAccentSoft: theme.accentSoft,
    presenceBorder: theme.border,
    presenceCardBg: theme.cardBg,
    presenceBadgeBg: theme.badgeBg,
    presenceBadgeText: theme.badgeText,
    presenceIconBg: theme.iconBg,
    presenceRoomNameColor: theme.roomNameColor,
    presenceIconName: theme.iconName,
    presenceDwellSoft: PRESENCE_DWELL_THEME.soft,
    presenceDwellBorder: PRESENCE_DWELL_THEME.border,
    presenceDwellTextColor: PRESENCE_DWELL_THEME.text,
    presenceCountdownSoft: (phase === 'pending_activation' ? PRESENCE_PENDING_THEME.soft : PRESENCE_AUTO_EXIT_THEME.soft) || '',
    presenceCountdownBorder: (phase === 'pending_activation' ? PRESENCE_PENDING_THEME.border : PRESENCE_AUTO_EXIT_THEME.border) || '',
    presenceCountdownTextColor: (phase === 'pending_activation' ? PRESENCE_PENDING_THEME.text : PRESENCE_AUTO_EXIT_THEME.text) || '',
    hasExemptRow: false,
  }, exemptVm, hasExemptRow ? {} : {
    hasExemptRow: false,
    exemptPhase: '',
    exemptBadge: '',
    exemptRoomNames: '',
    exemptDetailLine1: '',
    exemptDetailLine2: '',
    exemptAccent: '',
    exemptSoft: '',
    exemptBorder: '',
    exemptText: '',
    exemptIconName: 'gem-o',
  });
}

function isPresenceRefreshNotify(payload) {
  if (!payload) return false;
  if (payload.kind === 'presence_refresh') return true;
  if (payload.kind === 'refresh') {
    var reason = payload.reason || '';
    return reason.indexOf('presence:') === 0;
  }
  return false;
}

module.exports = {
  buildPresenceFromDashboard: buildPresenceFromDashboard,
  buildPresenceViewModel: buildPresenceViewModel,
  decorateExemptStatus: decorateExemptStatus,
  isPresenceRefreshNotify: isPresenceRefreshNotify,
};
