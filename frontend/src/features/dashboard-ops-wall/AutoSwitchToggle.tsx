import { Repeat, Repeat1 } from 'lucide-react';
import { useAutoPageSwitch } from './useAutoPageSwitch';
import { useLocation } from 'react-router-dom';

const PAGES = ['/console/dashboard', '/console/dashboard-preview'];

/**
 * Floating toggle button for auto page-switching.
 * Only renders on dashboard or dashboard-preview pages.
 */
export function AutoSwitchToggle() {
  const location = useLocation();
  const { enabled, toggle } = useAutoPageSwitch();

  const currentPath = location.pathname;
  const isTargetPage = PAGES.some((p) => currentPath === p || currentPath.endsWith(p));
  if (!isTargetPage) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled ? '自动切换已开启（每30秒）— 点击关闭' : '自动切换已关闭 — 点击开启'}
      className="auto-switch-toggle"
    >
      {enabled ? <Repeat className="auto-switch-toggle__icon" /> : <Repeat1 className="auto-switch-toggle__icon" />}
      <span className="auto-switch-toggle__label">{enabled ? 'ON' : 'OFF'}</span>
    </button>
  );
}
