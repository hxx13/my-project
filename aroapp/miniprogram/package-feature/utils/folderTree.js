/**
 * 文件夹树通用工具。assetRecord（存放地点树）与 fileTemplates（文件模板文件夹树）共用，
 * 避免同一份递归逻辑复制两份。纯函数，无 wx / 网络依赖。
 */

/** 在节点树里按 id 找节点，找不到返回 null */
function findNodeById(nodes, id) {
  if (id == null) return null;
  const list = nodes || [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === id) return list[i];
    const hit = findNodeById(list[i].children, id);
    if (hit) return hit;
  }
  return null;
}

/** 根到目标节点的路径（面包屑用），找不到返回空数组 */
function findNodePath(nodes, id, trail) {
  const acc = trail || [];
  const list = nodes || [];
  for (let i = 0; i < list.length; i += 1) {
    const next = acc.concat([{ id: list[i].id, name: list[i].name }]);
    if (list[i].id === id) return next;
    const hit = findNodePath(list[i].children, id, next);
    if (hit.length) return hit;
  }
  return [];
}

module.exports = { findNodeById, findNodePath };
