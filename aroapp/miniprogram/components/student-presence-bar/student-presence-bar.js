Component({
  data: {
    safeCountdownTextColor: '#c2410c',
  },
  observers: {
    countdownTextColor: function (v) {
      this.setData({ safeCountdownTextColor: v != null ? String(v) : '#c2410c' });
    },
  },
  lifetimes: {
    attached: function () {
      var v = this.properties.countdownTextColor;
      this.setData({ safeCountdownTextColor: v != null ? String(v) : '#c2410c' });
    },
  },
  properties: {
    visible: { type: Boolean, value: false },
    loading: { type: Boolean, value: true },
    wsConnected: { type: Boolean, value: false },
    label: { type: String, value: '' },
    phaseOutside: { type: Boolean, value: false },
    phaseUnknown: { type: Boolean, value: false },
    showRoomName: { type: Boolean, value: false },
    roomName: { type: String, value: '' },
    showDwell: { type: Boolean, value: false },
    dwellText: { type: String, value: '' },
    showCountdown: { type: Boolean, value: false },
    countdownLabel: { type: String, value: '' },
    countdownText: { type: String, value: '' },
    countdownUrgent: { type: Boolean, value: false },
    accent: { type: String, value: '#07c160' },
    accentSoft: { type: String, value: 'rgba(7,193,96,0.14)' },
    borderColor: { type: String, value: 'rgba(7,193,96,0.35)' },
    cardBg: { type: String, value: 'rgba(255,255,255,0.98)' },
    badgeBg: { type: String, value: '#07c160' },
    badgeText: { type: String, value: '#ffffff' },
    iconBg: { type: String, value: 'rgba(7,193,96,0.16)' },
    roomNameColor: { type: String, value: '#ac1736' },
    iconName: { type: String, value: 'passed' },
    dwellSoft: { type: String, value: 'rgba(37,99,235,0.1)' },
    dwellBorder: { type: String, value: 'rgba(37,99,235,0.22)' },
    dwellTextColor: { type: String, value: '#1d4ed8' },
    countdownSoft: { type: String, value: 'rgba(234,88,12,0.1)' },
    countdownBorder: { type: String, value: 'rgba(234,88,12,0.28)' },
    countdownTextColor: { type: String, value: '#c2410c' },
    hasExemptRow: { type: Boolean, value: false },
    exemptBadge: { type: String, value: '' },
    exemptRoomNames: { type: String, value: '' },
    exemptDetailLine1: { type: String, value: '' },
    exemptDetailLine2: { type: String, value: '' },
    exemptAccent: { type: String, value: '#16a34a' },
    exemptSoft: { type: String, value: 'rgba(22,163,74,0.1)' },
    exemptBorder: { type: String, value: 'rgba(22,163,74,0.28)' },
    exemptText: { type: String, value: '#15803d' },
    exemptIconName: { type: String, value: 'gem-o' },
  },
});
