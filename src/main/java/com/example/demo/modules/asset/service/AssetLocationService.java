package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.entity.AssetLocation;
import com.example.demo.modules.asset.mapper.AssetLocationMapper;
import com.example.demo.modules.asset.mapper.AssetMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.Set;

/**
 * 资产存放地点树服务。
 * 节点是结构真源，asset_record.location 与 EAV「存放地点」是展示镜像；
 * 改名/移动节点后由本类统一刷新子树文本镜像。
 */
@Service
public class AssetLocationService {

    /** 全路径分隔符 */
    private static final String PATH_SEP = " / ";

    private final AssetLocationMapper assetLocationMapper;
    private final AssetMapper assetMapper;

    public AssetLocationService(AssetLocationMapper assetLocationMapper, AssetMapper assetMapper) {
        this.assetLocationMapper = assetLocationMapper;
        this.assetMapper = assetMapper;
    }

    /**
     * 地点名称归一化：去首尾空白，连续空白（含全角空格）压成单个半角空格；空白串或 null 返回 null。
     */
    public static String normalizeLocationName(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.replaceAll("[\\s\\u3000]+", " ").trim();
        return s.isEmpty() ? null : s;
    }

    /** 全部未删除节点（导入地点匹配等只读场景用）。 */
    public List<AssetLocation> listAll() {
        return assetLocationMapper.listAll();
    }

    /** 节点存在且未删除 */
    public boolean exists(Long id) {
        return id != null && assetLocationMapper.findById(id) != null;
    }

    /**
     * 归一化后按 name 精确匹配（任意层级）；命中多个取 id 最小的。
     * 找不到返回 null。纯函数，便于单测。
     */
    public static AssetLocation matchByName(List<AssetLocation> nodes, String rawName) {
        String target = normalizeLocationName(rawName);
        if (target == null || nodes == null) {
            return null;
        }
        AssetLocation best = null;
        for (AssetLocation n : nodes) {
            if (n == null || n.getId() == null) {
                continue;
            }
            if (!target.equals(normalizeLocationName(n.getName()))) {
                continue;
            }
            if (best == null || n.getId() < best.getId()) {
                best = n;
            }
        }
        return best;
    }

    /**
     * 扁平节点 → 嵌套树。
     * parent_id 指向不存在节点的「孤儿」挂到根；同级按 sortOrder 再按 id 升序；
     * 节点带 directCount（直属资产）与 totalCount（含子树）。
     */
    public static List<AssetLocation> buildTree(List<AssetLocation> flat, Map<Long, Integer> directCounts) {
        List<AssetLocation> nodes = new ArrayList<>();
        if (flat != null) {
            for (AssetLocation n : flat) {
                if (n != null && n.getId() != null) {
                    nodes.add(n);
                }
            }
        }
        Map<Long, AssetLocation> byId = indexById(nodes);
        List<AssetLocation> roots = new ArrayList<>();
        for (AssetLocation n : nodes) {
            AssetLocation parent = n.getParentId() == null ? null : byId.get(n.getParentId());
            if (parent == null || parent == n) {
                roots.add(n);
            } else {
                if (parent.getChildren() == null) {
                    parent.setChildren(new ArrayList<>());
                }
                parent.getChildren().add(n);
            }
        }
        sortAndCount(roots, directCounts);
        return roots;
    }

    /**
     * 排序并自底向上汇总计数，返回本层 totalCount 之和。
     * 排序规则：有子节点的（真正的「文件夹」）置顶，叶子节点排后面；组内仍按 sortOrder、id。
     * 否则导入时批量建出来的几百个叶子地点，会把手工整理的文件夹挤到列表最末端。
     */
    private static int sortAndCount(List<AssetLocation> level, Map<Long, Integer> counts) {
        level.sort(Comparator
                .comparingInt((AssetLocation n) -> (n.getChildren() == null || n.getChildren().isEmpty()) ? 1 : 0)
                .thenComparingInt(n -> n.getSortOrder() == null ? 0 : n.getSortOrder())
                .thenComparing(AssetLocation::getId));
        int sum = 0;
        for (AssetLocation n : level) {
            int direct = counts == null ? 0 : counts.getOrDefault(n.getId(), 0);
            n.setDirectCount(direct);
            int sub = n.getChildren() == null ? 0 : sortAndCount(n.getChildren(), counts);
            n.setTotalCount(direct + sub);
            sum += n.getTotalCount();
        }
        return sum;
    }

    /**
     * 节点 id + 其全部后代 id（BFS）。与物品台账的 collectSpaceIdsWithDescendants 同口径，
     * 是「一次拉整棵子树、多级内联渲染」的前提。
     */
    public List<Long> collectIdsWithDescendants(Long nodeId) {
        if (nodeId == null) {
            return List.of();
        }
        List<AssetLocation> all = assetLocationMapper.listAll();
        Map<Long, List<Long>> childrenByParent = new HashMap<>();
        for (AssetLocation n : all) {
            if (n.getParentId() != null) {
                childrenByParent.computeIfAbsent(n.getParentId(), k -> new ArrayList<>()).add(n.getId());
            }
        }
        List<Long> result = new ArrayList<>();
        Deque<Long> stack = new ArrayDeque<>();
        Set<Long> seen = new HashSet<>();
        stack.push(nodeId);
        while (!stack.isEmpty()) {
            Long cur = stack.pop();
            if (cur == null || !seen.add(cur)) {
                continue;
            }
            result.add(cur);
            List<Long> children = childrenByParent.get(cur);
            if (children != null) {
                for (Long c : children) {
                    stack.push(c);
                }
            }
        }
        return result;
    }

    /** 完整地点树（含直属/子树资产计数） */
    public List<AssetLocation> tree() {
        List<AssetLocation> all = assetLocationMapper.listAll();
        Map<Long, Integer> counts = new HashMap<>();
        List<Map<String, Object>> rows = assetLocationMapper.countAssetsGroupByNode();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Long nodeId = toLong(row.get("nodeId"));
                if (nodeId != null) {
                    counts.put(nodeId, toInt(row.get("cnt")));
                }
            }
        }
        return buildTree(all, counts);
    }

    /** 手工新建地点：排到同级最前，免得被导入时批量建的几百个节点压在列表末尾。 */
    @Transactional
    public AssetLocation create(Long parentId, String name, String icon, String operatorId) {
        return create(parentId, name, icon, operatorId, true);
    }

    /**
     * 新建地点。
     * atTop=true → 排同级最前（手工新建，用户要能立刻看到自己刚建的）；
     * atTop=false → 排同级最后（导入批量建点，保持文件里原有的先后顺序）。
     */
    @Transactional
    public AssetLocation create(Long parentId, String name, String icon, String operatorId, boolean atTop) {
        String normalized = normalizeLocationName(name);
        if (normalized == null) {
            throw new IllegalArgumentException("地点名称不能为空");
        }
        List<AssetLocation> all = assetLocationMapper.listAll();
        if (parentId != null && findIn(all, parentId) == null) {
            throw new IllegalArgumentException("父节点不存在");
        }
        int edgeSort = 0;
        boolean hasSibling = false;
        for (AssetLocation n : all) {
            if (Objects.equals(n.getParentId(), parentId)) {
                int s = n.getSortOrder() == null ? 0 : n.getSortOrder();
                if (!hasSibling || (atTop ? s < edgeSort : s > edgeSort)) {
                    edgeSort = s;
                }
                hasSibling = true;
            }
        }
        AssetLocation node = new AssetLocation();
        node.setParentId(parentId);
        node.setName(normalized);
        node.setSortOrder(hasSibling ? (atTop ? edgeSort - 1 : edgeSort + 1) : 0);
        node.setIcon(normalizeIcon(icon));
        assetLocationMapper.insert(node);
        return node;
    }

    /** emoji 图标归一化：空白串视为 null（不设图标），否则去首尾空白 */
    private static String normalizeIcon(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        return s.isEmpty() ? null : s;
    }

    /**
     * 文本 → 节点 id。用于正式转移完成等「只有文本、没有节点」的写回场景。
     * 归一化后依次尝试：① 按 " / " 逐段匹配整条路径；② 按末段名在任意层级匹配；
     * ③ 仍找不到则以**末段名**新建顶层节点（避免把 "父 / 子" 整串当节点名）。
     * 归一化后为空（null/空白串）返回 null，由调用方决定是否回落。
     */
    @Transactional
    public Long resolveOrCreateTopLevelByName(String rawName) {
        String normalized = normalizeLocationName(rawName);
        if (normalized == null) {
            return null;
        }
        List<AssetLocation> all = assetLocationMapper.listAll();
        Long byPath = findByPath(all, normalized);
        if (byPath != null) {
            return byPath;
        }
        String leaf = leafSegment(normalized);
        for (AssetLocation n : all) {
            if (leaf.equals(n.getName())) {
                return n.getId();
            }
        }
        return create(null, leaf, null, null, false).getId();
    }

    /** 按 " / " 从根逐段匹配；任一段匹配不到返回 null。 */
    private static Long findByPath(List<AssetLocation> all, String path) {
        Long parentId = null;
        AssetLocation current = null;
        for (String rawSeg : path.split(Pattern.quote(PATH_SEP))) {
            String seg = rawSeg.trim();
            if (seg.isEmpty()) {
                return null;
            }
            current = null;
            for (AssetLocation n : all) {
                if (Objects.equals(n.getParentId(), parentId) && seg.equals(n.getName())) {
                    current = n;
                    break;
                }
            }
            if (current == null) {
                return null;
            }
            parentId = current.getId();
        }
        return current == null ? null : current.getId();
    }

    private static String leafSegment(String normalized) {
        int idx = normalized.lastIndexOf(PATH_SEP);
        return idx < 0 ? normalized : normalized.substring(idx + PATH_SEP.length()).trim();
    }

    /**
     * 局部更新：name / parentId / sortOrder 为 null 时保持原值（与 patchAsset 的 null=不改 一致）。
     * 防环：不能把节点挂到它自己或它的子孙下。
     * ponytail: parentId=null 表示不改父节点，P1 无「移到顶层」入口；需要时加显式 toRoot 标志。
     */
    @Transactional
    public AssetLocation update(Long id, String name, Long parentId, Integer sortOrder, String icon) {
        if (id == null) {
            throw new IllegalArgumentException("节点ID不能为空");
        }
        List<AssetLocation> all = assetLocationMapper.listAll();
        AssetLocation node = findIn(all, id);
        if (node == null) {
            throw new IllegalArgumentException("地点节点不存在");
        }
        String normalized = name == null ? node.getName() : normalizeLocationName(name);
        if (normalized == null) {
            throw new IllegalArgumentException("地点名称不能为空");
        }
        if (parentId != null) {
            if (findIn(all, parentId) == null) {
                throw new IllegalArgumentException("父节点不存在");
            }
            if (collectSubtreeIds(all, id).contains(parentId)) {
                throw new IllegalArgumentException("不能把节点移动到它自己或它的子节点下");
            }
        }
        boolean renamed = !Objects.equals(node.getName(), normalized);
        boolean moved = parentId != null && !Objects.equals(node.getParentId(), parentId);
        int order = sortOrder != null ? sortOrder : (node.getSortOrder() == null ? 0 : node.getSortOrder());
        Long targetParent = parentId != null ? parentId : node.getParentId();
        String normalizedIcon = normalizeIcon(icon);
        assetLocationMapper.updateNode(id, normalized, targetParent, order, normalizedIcon);
        if (normalizedIcon != null) {
            node.setIcon(normalizedIcon);
        }
        if (renamed || moved) {
            // 同步内存态后再算新路径
            node.setName(normalized);
            node.setParentId(targetParent);
            node.setSortOrder(order);
            refreshSubtreeTextMirror(all, id);
        }
        return node;
    }

    @Transactional
    public void delete(Long id) {
        AssetLocation node = assetLocationMapper.findById(id);
        if (node == null) {
            throw new IllegalArgumentException("地点节点不存在");
        }
        if (assetLocationMapper.countChildren(id) > 0 || assetLocationMapper.countAssets(id) > 0) {
            throw new IllegalArgumentException("请先移走其下的资产或子节点");
        }
        assetLocationMapper.softDelete(id);
    }

    /** 自底向上拼全路径，节点不存在返回 null */
    public String pathOf(Long nodeId) {
        if (nodeId == null) {
            return null;
        }
        return buildPath(indexById(assetLocationMapper.listAll()), nodeId);
    }

    /** 刷新 rootId 及其子树下所有资产的 location / EAV 文本镜像 */
    private void refreshSubtreeTextMirror(List<AssetLocation> all, Long rootId) {
        Set<Long> subtree = collectSubtreeIds(all, rootId);
        Map<Long, AssetLocation> byId = indexById(all);
        String storageKey = AssetService.pickStorageLocationColumnKey(assetMapper.listColumnDefs());
        for (AssetLocation n : all) {
            if (!subtree.contains(n.getId())) {
                continue;
            }
            String path = buildPath(byId, n.getId());
            if (path == null) {
                continue;
            }
            assetMapper.updateLocationTextByNode(n.getId(), path);
            if (StringUtils.hasText(storageKey)) {
                assetMapper.updateAssetValueTextByNode(n.getId(), storageKey, path);
            }
        }
    }

    private static String buildPath(Map<Long, AssetLocation> byId, Long nodeId) {
        if (nodeId == null || !byId.containsKey(nodeId)) {
            return null;
        }
        LinkedList<String> parts = new LinkedList<>();
        Long cur = nodeId;
        int guard = 0;
        while (cur != null && guard++ <= byId.size() + 1) {
            AssetLocation n = byId.get(cur);
            if (n == null) {
                return null;
            }
            parts.addFirst(n.getName() == null ? "" : n.getName());
            cur = n.getParentId();
        }
        return String.join(PATH_SEP, parts);
    }

    /** rootId 自身 + 所有子孙 id */
    private static Set<Long> collectSubtreeIds(List<AssetLocation> all, Long rootId) {
        Map<Long, List<Long>> childrenOf = new HashMap<>();
        for (AssetLocation n : all) {
            if (n.getParentId() != null) {
                childrenOf.computeIfAbsent(n.getParentId(), k -> new ArrayList<>()).add(n.getId());
            }
        }
        Set<Long> out = new HashSet<>();
        Deque<Long> queue = new ArrayDeque<>();
        if (rootId != null) {
            queue.add(rootId);
        }
        while (!queue.isEmpty()) {
            Long cur = queue.poll();
            if (!out.add(cur)) {
                continue;
            }
            List<Long> kids = childrenOf.get(cur);
            if (kids != null) {
                queue.addAll(kids);
            }
        }
        return out;
    }

    private static Map<Long, AssetLocation> indexById(List<AssetLocation> all) {
        Map<Long, AssetLocation> byId = new LinkedHashMap<>();
        if (all != null) {
            for (AssetLocation n : all) {
                if (n != null && n.getId() != null) {
                    byId.put(n.getId(), n);
                }
            }
        }
        return byId;
    }

    private static AssetLocation findIn(List<AssetLocation> all, Long id) {
        if (all == null || id == null) {
            return null;
        }
        for (AssetLocation n : all) {
            if (id.equals(n.getId())) {
                return n;
            }
        }
        return null;
    }

    private static Long toLong(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    private static int toInt(Object v) {
        return v instanceof Number n ? n.intValue() : 0;
    }
}
