package com.example.demo.modules.adminfile;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class AdminFileFolderService {

    private final AdminFileFolderJdbcRepository folderRepo;

    public AdminFileFolderService(AdminFileFolderJdbcRepository folderRepo) {
        this.folderRepo = folderRepo;
    }

    /**
     * 扁平节点 → 嵌套树。
     * 父节点不存在的「孤儿」挂到根；同级按 sortOrder 再按 id 升序；
     * 节点带 directCount（直属文件）与 totalCount（含子树）。
     * 算法与 AssetLocationService.buildTree 同口径（勿擅自改成别的排序语义）。
     */
    public static List<AdminFileFolder> buildTree(List<AdminFileFolder> flat, Map<Long, Integer> directCounts) {
        List<AdminFileFolder> nodes = new ArrayList<>();
        if (flat != null) {
            for (AdminFileFolder n : flat) {
                if (n != null && n.getId() != null) {
                    nodes.add(n);
                }
            }
        }
        Map<Long, AdminFileFolder> byId = new LinkedHashMap<>();
        for (AdminFileFolder n : nodes) {
            byId.put(n.getId(), n);
        }
        List<AdminFileFolder> roots = new ArrayList<>();
        for (AdminFileFolder n : nodes) {
            AdminFileFolder parent = n.getParentId() == null ? null : byId.get(n.getParentId());
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
     * 排序规则：有子节点的（真正的「文件夹」）置顶，叶子排后面；组内按 sortOrder、id。
     * 置顶这一条不能删——否则批量建的几百个叶子会把手工整理的文件夹挤到最末端。
     */
    private static int sortAndCount(List<AdminFileFolder> level, Map<Long, Integer> counts) {
        level.sort(Comparator
                .comparingInt((AdminFileFolder n) -> (n.getChildren() == null || n.getChildren().isEmpty()) ? 1 : 0)
                .thenComparingInt(n -> n.getSortOrder() == null ? 0 : n.getSortOrder())
                .thenComparing(AdminFileFolder::getId));
        int sum = 0;
        for (AdminFileFolder n : level) {
            int direct = counts == null ? 0 : counts.getOrDefault(n.getId(), 0);
            n.setDirectCount(direct);
            int sub = n.getChildren() == null ? 0 : sortAndCount(n.getChildren(), counts);
            n.setTotalCount(direct + sub);
            sum += n.getTotalCount();
        }
        return sum;
    }

    /** 全部未删除节点（只读场景用） */
    public List<AdminFileFolder> listAll() {
        return folderRepo.listAll();
    }

    /** 完整文件夹树（含直属/子树文件计数） */
    public List<AdminFileFolder> tree() {
        return buildTree(folderRepo.listAll(), folderRepo.countFilesGroupByFolder());
    }

    /** 名称归一化：去首尾空白，连续空白（含全角）压成单个半角空格；空串返回 null */
    public static String normalizeName(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.replaceAll("[\\s\\u3000]+", " ").trim();
        return s.isEmpty() ? null : s;
    }

    /** emoji 图标归一化：空白串视为不设图标 */
    private static String normalizeIcon(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        return s.isEmpty() ? null : s;
    }

    /**
     * rootId 自身 + 所有子孙 id。**包级可见而非 private**：防环判定全靠它，
     * 必须能被 AdminFileFolderTreeTest 直接测——环会让前端树无限递归直接崩。
     */
    static Set<Long> collectSubtreeIds(List<AdminFileFolder> all, Long rootId) {
        Map<Long, List<Long>> childrenOf = new HashMap<>();
        for (AdminFileFolder n : all) {
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

    private static AdminFileFolder findIn(List<AdminFileFolder> all, Long id) {
        if (all == null || id == null) {
            return null;
        }
        for (AdminFileFolder n : all) {
            if (id.equals(n.getId())) {
                return n;
            }
        }
        return null;
    }

    /** 手工新建：排到同级最前，免得被别的节点压在末尾 */
    @Transactional
    public AdminFileFolder create(Long parentId, String name, String icon) {
        String normalized = normalizeName(name);
        if (normalized == null) {
            throw new IllegalArgumentException("文件夹名称不能为空");
        }
        List<AdminFileFolder> all = folderRepo.listAll();
        if (parentId != null && findIn(all, parentId) == null) {
            throw new IllegalArgumentException("父文件夹不存在");
        }
        int edgeSort = 0;
        boolean hasSibling = false;
        for (AdminFileFolder n : all) {
            if (Objects.equals(n.getParentId(), parentId)) {
                int s = n.getSortOrder() == null ? 0 : n.getSortOrder();
                if (!hasSibling || s < edgeSort) {
                    edgeSort = s;
                }
                hasSibling = true;
            }
        }
        int order = hasSibling ? edgeSort - 1 : 0;
        folderRepo.insert(parentId, normalized, order, normalizeIcon(icon));
        return null;
    }

    /**
     * 改名 / 改图标 / 改父节点。null 参数表示保持原值。
     * 防环：不能把节点挂到它自己或它的子孙下。
     */
    @Transactional
    public AdminFileFolder update(Long id, String name, Long parentId, String icon) {
        if (id == null) {
            throw new IllegalArgumentException("文件夹ID不能为空");
        }
        List<AdminFileFolder> all = folderRepo.listAll();
        AdminFileFolder node = findIn(all, id);
        if (node == null) {
            throw new IllegalArgumentException("文件夹不存在");
        }
        String normalized = name == null ? node.getName() : normalizeName(name);
        if (normalized == null) {
            throw new IllegalArgumentException("文件夹名称不能为空");
        }
        if (parentId != null) {
            if (findIn(all, parentId) == null) {
                throw new IllegalArgumentException("父文件夹不存在");
            }
            if (collectSubtreeIds(all, id).contains(parentId)) {
                throw new IllegalArgumentException("不能把文件夹移动到它自己或它的子文件夹下");
            }
        }
        int order = node.getSortOrder() == null ? 0 : node.getSortOrder();
        Long targetParent = parentId != null ? parentId : node.getParentId();
        folderRepo.updateNode(id, normalized, targetParent, order, normalizeIcon(icon));
        node.setName(normalized);
        node.setParentId(targetParent);
        node.setSortOrder(order);
        return node;
    }

    /** 非空拒绝删除：有子文件夹或直属文件时拒绝 */
    @Transactional
    public void delete(Long id) {
        AdminFileFolder node = folderRepo.findById(id);
        if (node == null) {
            throw new IllegalArgumentException("文件夹不存在");
        }
        if (folderRepo.countChildren(id) > 0 || folderRepo.countFiles(id) > 0) {
            throw new IllegalArgumentException("请先移走其中的文件或子文件夹");
        }
        folderRepo.softDelete(id);
    }

    public boolean exists(Long id) {
        return id != null && folderRepo.findById(id) != null;
    }
}
