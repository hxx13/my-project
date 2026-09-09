package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.entity.AssetLocation;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 地点树构建：嵌套、计数、孤儿挂根、同级排序 */
class AssetLocationTreeTest {

    private static AssetLocation node(long id, Long parentId, String name, int sortOrder) {
        AssetLocation n = new AssetLocation();
        n.setId(id);
        n.setParentId(parentId);
        n.setName(name);
        n.setSortOrder(sortOrder);
        return n;
    }

    private static List<Long> ids(List<AssetLocation> nodes) {
        List<Long> out = new ArrayList<>();
        if (nodes != null) {
            for (AssetLocation n : nodes) out.add(n.getId());
        }
        return out;
    }

    @Test
    void nestsByParentAndSortsSiblingsBySortOrderThenId() {
        List<AssetLocation> flat = List.of(
                node(1L, null, "A", 2),
                node(2L, null, "B", 1),
                node(3L, 1L, "A1", 0),
                node(4L, 3L, "A1a", 0),
                node(5L, 1L, "A2", 0)
        );
        List<AssetLocation> roots = AssetLocationService.buildTree(flat, Map.of());

        assertEquals(List.of(2L, 1L), ids(roots));
        assertEquals(List.of(3L, 5L), ids(roots.get(1).getChildren()));
        assertEquals(List.of(4L), ids(roots.get(1).getChildren().get(0).getChildren()));
    }

    @Test
    void sameSortOrderFallsBackToIdAsc() {
        List<AssetLocation> flat = List.of(
                node(9L, null, "nine", 0),
                node(3L, null, "three", 0),
                node(7L, null, "seven", 0)
        );
        List<AssetLocation> roots = AssetLocationService.buildTree(flat, Map.of());
        assertEquals(List.of(3L, 7L, 9L), ids(roots));
    }

    @Test
    void orphanParentAttachesToRoot() {
        List<AssetLocation> flat = List.of(
                node(1L, null, "root", 0),
                node(2L, 999L, "orphan", 1)
        );
        List<AssetLocation> roots = AssetLocationService.buildTree(flat, Map.of());
        assertEquals(List.of(1L, 2L), ids(roots));
    }

    @Test
    void directAndTotalCountsIncludeSubtree() {
        List<AssetLocation> flat = List.of(
                node(1L, null, "A", 0),
                node(2L, 1L, "A1", 0),
                node(3L, 2L, "A1a", 0),
                node(4L, null, "B", 1)
        );
        Map<Long, Integer> counts = new HashMap<>();
        counts.put(1L, 2);
        counts.put(2L, 1);
        counts.put(4L, 5);

        List<AssetLocation> roots = AssetLocationService.buildTree(flat, counts);
        AssetLocation a = roots.get(0);
        assertEquals(2, a.getDirectCount());
        assertEquals(3, a.getTotalCount());       // 2 直属 + 子树 1
        assertEquals(1, a.getChildren().get(0).getDirectCount());
        assertEquals(1, a.getChildren().get(0).getTotalCount());
        assertEquals(0, a.getChildren().get(0).getChildren().get(0).getTotalCount());
        assertEquals(5, roots.get(1).getTotalCount());
    }

    @Test
    void emptyOrNullInputYieldsEmptyTree() {
        assertTrue(AssetLocationService.buildTree(null, null).isEmpty());
        assertTrue(AssetLocationService.buildTree(List.of(), null).isEmpty());
    }
}
