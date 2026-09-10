// scripts/check-cage-form-edit-grant.mjs
//
// 笼位表单「客户端编辑授权」的可运行自检。
// 这是两端一致性的关键分支：Web 端 CageFormFill 是
//   canEdit = 客户端授权(角色≥ADMIN ‖ 身份含 BREEDING_GROUP_LEADER) ‖ 服务端按笼位判定
// 小程序原先只有服务端那一半，同一个账号会出现 Web 能编、小程序不能。
// 判定写错会直接变成「莫名的权限差异」且不报错，只能靠这里挡住。
//
// 用法: node scripts/check-cage-form-edit-grant.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// roleAccess.js 顶层 require springAuth.js，后者会摸 wx 存储 —— 先给个最小桩
globalThis.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
};

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  hasCageFormEditGrant, CODE_BREEDING_GROUP_LEADER,
} = require(join(here, '..', 'aroapp', 'miniprogram', 'utils', 'roleAccess.js'));

let passed = 0;
const it = (name, fn) => {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
};

const LEADER = { [CODE_BREEDING_GROUP_LEADER]: true };
const OTHER = { SECRETARY: true };

console.log('hasCageFormEditGrant');

it('管理员及以上直接放行，不看身份', () => {
  for (const role of ['ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER']) {
    assert.equal(hasCageFormEditGrant(role, {}), true, role);
  }
});

it('高级员工（SENIOR，3 级）不含在内 —— 阈值是 ADMIN(4)', () => {
  assert.equal(hasCageFormEditGrant('SENIOR', {}), false);
  assert.equal(hasCageFormEditGrant('STAFF', {}), false);
  assert.equal(hasCageFormEditGrant('MEMBER', {}), false);
});

it('非管理员但持饲养组长身份 → 放行（这正是 Web 有、小程序原先缺的那条）', () => {
  assert.equal(hasCageFormEditGrant('SENIOR', LEADER), true);
  assert.equal(hasCageFormEditGrant('STAFF', LEADER), true);
});

it('持其它身份码不放行', () => {
  assert.equal(hasCageFormEditGrant('SENIOR', OTHER), false);
});

it('身份码集合缺失或为空不放行（接口失败退化为只认服务端，不误放行）', () => {
  assert.equal(hasCageFormEditGrant('SENIOR', undefined), false);
  assert.equal(hasCageFormEditGrant('SENIOR', null), false);
  assert.equal(hasCageFormEditGrant('SENIOR', {}), false);
});

it('身份码为假值不算持有', () => {
  assert.equal(hasCageFormEditGrant('SENIOR', { [CODE_BREEDING_GROUP_LEADER]: false }), false);
});

it('角色大小写不敏感', () => {
  assert.equal(hasCageFormEditGrant('admin', {}), true);
});

it('身份码常量与后端 CODE_LEADER 一致', () => {
  // 后端 CageModeVisibilityService.CODE_LEADER = "BREEDING_GROUP_LEADER"
  // Web LocalDetailPanel 也是比对这个字面量；三处必须同一串
  assert.equal(CODE_BREEDING_GROUP_LEADER, 'BREEDING_GROUP_LEADER');
});

console.log(`\n${passed} 项通过` + (process.exitCode ? '，有失败项' : ''));
