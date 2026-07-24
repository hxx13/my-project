/**
 * 机房侧栏 Tab 与 viewChunks 合成（与 Web telemetry-view/animalTelemetryHvacUnits.ts 同源逻辑）。
 */

'use strict';

var ANIMAL_ROOM_HVAC_TAB_KEY = '__hvac_units__';

function pickTrim(v) {
  if (v == null) return '';
  return String(v).trim();
}

function normTabKey(k) {
  return pickTrim(k).toLowerCase();
}

function isSyntheticHvacTabKey(k) {
  return normTabKey(k) === normTabKey(ANIMAL_ROOM_HVAC_TAB_KEY);
}

/** @param {{ suite?: Record<string, unknown> } | null | undefined} prepared */
/** @param {{ displayTitle?: string, roomCanonical?: string } | null | undefined} card */
function microRoomCardIsHvacMechanical(card) {
  if (!card) return false;
  var dt = pickTrim(card.displayTitle);
  var rc = pickTrim(card.roomCanonical);
  var hay = (dt + ' ' + rc).toUpperCase();
  if (hay.indexOf('FAU') >= 0 || hay.indexOf('PAU') >= 0 || hay.indexOf('AHU') >= 0 || hay.indexOf('MAU') >= 0)
    return true;
  if (hay.indexOf('锅炉') >= 0) return true;
  if (hay.indexOf('动力站') >= 0) return true;
  return false;
}

/**
 * 普通楼层展示：去掉已在「机房」Tab 聚合的块（与 Web filterHubChunksExcludeHvacUnits 对齐）。
 * @param {unknown[]} chunks
 */
function filterHubChunksExcludeHvacUnits(chunks) {
  var out = [];
  if (!Array.isArray(chunks)) return out;
  for (var ci = 0; ci < chunks.length; ci++) {
    var ch = chunks[ci];
    if (!ch || typeof ch !== 'object') continue;
    if (ch.kind === 'suite' && ch.prepared && isHvacMechanicalSuitePrepared(ch.prepared)) continue;
    if (ch.kind === 'chromeSuiteRow' && Array.isArray(ch.list) && ch.list.length) {
      var newList = [];
      for (var li = 0; li < ch.list.length; li++) {
        var cell = ch.list[li];
        if (!cell || typeof cell !== 'object') continue;
        var micro = Array.isArray(cell.webSoloMicroGrid)
          ? cell.webSoloMicroGrid.filter(Boolean)
          : [];
        if (micro.length) {
          var kept = micro.filter(function (c) {
            return !microRoomCardIsHvacMechanical(c);
          });
          if (!kept.length) continue;
          if (kept.length === micro.length) newList.push(cell);
          else newList.push(Object.assign({}, cell, { webSoloMicroGrid: kept }));
          continue;
        }
        var mainPrep = cell.prepared || undefined;
        var sidePrep = Array.isArray(cell.webSidecarPreparedSuites)
          ? cell.webSidecarPreparedSuites.filter(Boolean)
          : [];
        var mainHvac = !!(mainPrep && isHvacMechanicalSuitePrepared(mainPrep));
        var sidesKept = sidePrep.filter(function (p) {
          return !isHvacMechanicalSuitePrepared(p);
        });
        var next = Object.assign({}, cell);
        if (mainHvac) next.prepared = undefined;
        if (sidePrep.length && sidesKept.length !== sidePrep.length) {
          next.webSidecarPreparedSuites = sidesKept.length ? sidesKept : undefined;
        }
        var hasPrepared = !!next.prepared;
        var hasSides = Array.isArray(next.webSidecarPreparedSuites) && next.webSidecarPreparedSuites.length > 0;
        var hasMicro =
          Array.isArray(next.webSoloMicroGrid) && next.webSoloMicroGrid.filter(Boolean).length > 0;
        if (!hasPrepared && !hasSides && !hasMicro) continue;
        newList.push(next);
      }
      if (!newList.length) continue;
      var unchanged =
        newList.length === ch.list.length &&
        newList.every(function (c, i) {
          return c === ch.list[i];
        });
      out.push(unchanged ? ch : Object.assign({}, ch, { key: String(ch.key || '') + '-no-hvac', list: newList }));
      continue;
    }
    out.push(ch);
  }
  return out;
}

function isHvacMechanicalSuitePrepared(prepared) {
  if (!prepared || !prepared.suite) return false;
  var s = prepared.suite;
  var parts = [];
  var sn = pickTrim(s.suiteNorm);
  var st = pickTrim(s.suiteTitle);
  if (sn) parts.push(sn);
  if (st) parts.push(st);
  var rooms = Array.isArray(s.rooms) ? s.rooms : [];
  for (var i = 0; i < rooms.length; i++) {
    var rc = pickTrim(rooms[i] && rooms[i].roomCanonical);
    if (rc) parts.push(rc);
  }
  var hay = parts.join(' ').toUpperCase();
  if (hay.indexOf('FAU') >= 0 || hay.indexOf('PAU') >= 0 || hay.indexOf('AHU') >= 0 || hay.indexOf('MAU') >= 0)
    return true;
  if (hay.indexOf('锅炉') >= 0) return true;
  if (hay.indexOf('动力站') >= 0) return true;
  return false;
}

function hubChromeCellIsHvac(cell) {
  if (!cell) return false;
  if (cell.prepared && isHvacMechanicalSuitePrepared(cell.prepared)) return true;
  var side = cell.webSidecarPreparedSuites;
  if (!cell.prepared && Array.isArray(side) && side.length) {
    for (var i = 0; i < side.length; i++) {
      if (!isHvacMechanicalSuitePrepared(side[i])) return false;
    }
    return true;
  }
  return false;
}

function splitHubChromeList(list) {
  var primary = [];
  var hvac = [];
  for (var i = 0; i < list.length; i++) {
    var cell = list[i];
    if (hubChromeCellIsHvac(cell)) hvac.push(cell);
    else primary.push(cell);
  }
  return { primary: primary, hvac: hvac };
}

function extractHvacOnlyHubChunks(chunks) {
  var out = [];
  if (!Array.isArray(chunks)) return out;
  for (var i = 0; i < chunks.length; i++) {
    var ch = chunks[i];
    if (ch.kind === 'suite' && ch.prepared && isHvacMechanicalSuitePrepared(ch.prepared)) {
      out.push(ch);
      continue;
    }
    if (ch.kind === 'chromeSuiteRow' && Array.isArray(ch.list) && ch.list.length) {
      var sp = splitHubChromeList(ch.list);
      if (sp.hvac.length) {
        out.push(Object.assign({}, ch, { key: String(ch.key || '') + '-hvac', list: sp.hvac }));
      }
    }
  }
  return out;
}

/**
 * @param {Array<{ tabKey?: string, title?: string, viewChunks?: unknown[] }>} baseTabs
 * @returns {{ tabKey: string, title: string, roomCount: number, suiteCount: number, viewChunks: unknown[] } | null}
 */
function buildSyntheticHvacHubTab(baseTabs) {
  var outChunks = [];
  var any = false;
  if (!Array.isArray(baseTabs)) return null;
  for (var i = 0; i < baseTabs.length; i++) {
    var tab = baseTabs[i];
    var tk = pickTrim(tab && tab.tabKey);
    if (!tk || isSyntheticHvacTabKey(tk)) continue;
    var hv = extractHvacOnlyHubChunks(tab.viewChunks || []);
    if (!hv.length) continue;
    any = true;
    outChunks.push({
      kind: 'zoneBand',
      key: 'hvac-band-' + tk,
      zoneLabel: tab.title || tk || '—',
    });
    for (var j = 0; j < hv.length; j++) outChunks.push(hv[j]);
  }
  if (!any) return null;
  return {
    tabKey: ANIMAL_ROOM_HVAC_TAB_KEY,
    title: '机房',
    roomCount: 0,
    suiteCount: 0,
    viewChunks: outChunks,
  };
}

/**
 * @param {Array<{ tabKey?: string, title?: string, viewChunks?: unknown[] }>} baseTabs
 * @param {{ hvacMechanicalHubViewChunks?: unknown[] } | null | undefined} [page]
 * @returns {{ tabKey: string, title: string, roomCount: number, suiteCount: number, viewChunks: unknown[] } | null}
 */
function resolveSyntheticHvacTab(baseTabs, page) {
  var fromServer = page && page.hvacMechanicalHubViewChunks;
  if (Array.isArray(fromServer) && fromServer.length) {
    return {
      tabKey: ANIMAL_ROOM_HVAC_TAB_KEY,
      title: '机房',
      roomCount: 0,
      suiteCount: 0,
      viewChunks: fromServer,
    };
  }
  return buildSyntheticHvacHubTab(baseTabs);
}

/**
 * @param {Array<{ tabKey?: string, title?: string, viewChunks?: unknown[] }>} baseTabs
 * @param {{ hvacMechanicalHubViewChunks?: unknown[] } | null | undefined} [page]
 */
function mergeDisplayTabsWithHvac(baseTabs, page) {
  var base = Array.isArray(baseTabs) ? baseTabs.slice() : [];
  var syn = resolveSyntheticHvacTab(baseTabs, page);
  return syn ? base.concat([syn]) : base;
}

module.exports = {
  ANIMAL_ROOM_HVAC_TAB_KEY: ANIMAL_ROOM_HVAC_TAB_KEY,
  isSyntheticHvacTabKey: isSyntheticHvacTabKey,
  isHvacMechanicalSuitePrepared: isHvacMechanicalSuitePrepared,
  filterHubChunksExcludeHvacUnits: filterHubChunksExcludeHvacUnits,
  buildSyntheticHvacHubTab: buildSyntheticHvacHubTab,
  resolveSyntheticHvacTab: resolveSyntheticHvacTab,
  mergeDisplayTabsWithHvac: mergeDisplayTabsWithHvac,
};
