package com.example.demo.modules.adminfile;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** 文件夹树构建：嵌套、计数、孤儿挂根、同级排序、文件夹置顶 */
class AdminFileFolderTreeTest {

    private static AdminFileFolder node(long id, Long parentId, String name, int sortOrder) {
        AdminFileFolder n = new AdminFileFolder();
        n.setId(id);
        n.setParentId(parentId);
        n.setName(name);
        n.setSortOrder(sortOrder);
        n.setDeleted(0);
        return n;
    }

    private static List<Long> ids(List<AdminFileFolder> nodes) {
        List<Long> out = new ArrayList<>();
        if (nodes != null) {
            for (AdminFileFolder n : nodes) out.add(n.getId());
        }
        return out;
    }

    @Test
    void nestsByParentAndSortsSiblingsBySortOrderThenId() {
        // 根层两个节点都必须有子节点，否则会撞上「文件夹置顶」规则（见 sortedRootsAreNotLeaves，
        // 那条规则优先于 sortOrder），这个用例就测不出 sortOrder 的作用了。
        List<AdminFileFolder> flat = List.of(
                node(1L, null, "A", 2),
                node(2L, null, "B", 1),
                node(6L, 2L, "B1", 0),
                node(3L, 1L, "A1", 0),
                node(4L, 3L, "A1a", 0),
                node(5L, 1L, "A2", 0)
        );
        List<AdminFileFolder> roots = AdminFileFolderService.buildTree(flat, Map.of());

        // A、B 都非叶子 → 置顶优先级相同 → 退化为按 sortOrder：B(1) 先于 A(2)
        assertEquals(List.of(2L, 1L), ids(roots));
        // A 的两个子节点同为叶子，sortOrder 都是 0 → 按 id 升序
        assertEquals(List.of(3L, 5L), ids(roots.get(1).getChildren()));
        assertEquals(List.of(4L), ids(roots.get(1).getChildren().get(0).getChildren()));
    }

    @Test
    void countRollsUpFromDescendants() {
        List<AdminFileFolder> flat = List.of(
                node(1L, null, "root", 0),
                node(2L, 1L, "child", 0)
        );
        // 直属文件数：root=1，child=2
        List<AdminFileFolder> roots = AdminFileFolderService.buildTree(flat, Map.of(1L, 1, 2L, 2));

        assertEquals(1, roots.get(0).getDirectCount());
        assertEquals(3, roots.get(0).getTotalCount());
        assertEquals(2, roots.get(0).getChildren().get(0).getTotalCount());
    }

    @Test
    void orphanParentFallsBackToRoot() {
        List<AdminFileFolder> flat = List.of(node(7L, 999L, "orphan", 0));
        List<AdminFileFolder> roots = AdminFileFolderService.buildTree(flat, Map.of());
        assertEquals(List.of(7L), ids(roots));
    }

    @Test
    void nodesWithChildrenSortBeforeLeaves() {
        List<AdminFileFolder> flat = List.of(
                node(1L, null, "leaf-a", 0),
                node(2L, null, "folder", 5),
                node(3L, 2L, "inner", 0)
        );
        List<AdminFileFolder> roots = AdminFileFolderService.buildTree(flat, Map.of());
        // 2 有子节点 → 置顶；1 是叶子 → 即使 sortOrder 更小也排在后面
        assertEquals(List.of(2L, 1L), ids(roots));
    }

    @Test
    void selfParentNodeFallsBackToRoot() {
        List<AdminFileFolder> flat = List.of(node(4L, 4L, "self", 0));
        List<AdminFileFolder> roots = AdminFileFolderService.buildTree(flat, Map.of());
        assertEquals(List.of(4L), ids(roots));
    }

    @Test
    void subtreeIdsIncludeSelfAndAllDescendants() {
        List<AdminFileFolder> flat = List.of(
                node(1L, null, "A", 0),
                node(2L, 1L, "A1", 0),
                node(3L, 2L, "A1a", 0),
                node(4L, null, "B", 0),
                node(5L, 4L, "B1", 0)
        );
        assertEquals(java.util.Set.of(1L, 2L, 3L), AdminFileFolderService.collectSubtreeIds(flat, 1L));
        assertEquals(java.util.Set.of(3L), AdminFileFolderService.collectSubtreeIds(flat, 3L));
        assertEquals(java.util.Set.of(4L, 5L), AdminFileFolderService.collectSubtreeIds(flat, 4L));
    }
}
