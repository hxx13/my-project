package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.entity.AssetLocation;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** matchByName：归一化后按 name 精确匹配，任意层级，命中多个取 id 最小 */
class AssetLocationImportMatchTest {

    private static AssetLocation node(long id, Long parentId, String name) {
        AssetLocation n = new AssetLocation();
        n.setId(id);
        n.setParentId(parentId);
        n.setName(name);
        return n;
    }

    @Test
    void normalizesWhitespaceBeforeMatching() {
        List<AssetLocation> nodes = List.of(node(7L, null, "西6"));
        assertEquals(7L, AssetLocationService.matchByName(nodes, "  　西6  ").getId());
    }

    @Test
    void matchesNodeAtAnyDepth() {
        List<AssetLocation> nodes = List.of(
                node(1L, null, "浦东校区"),
                node(2L, 1L, "动科部")
        );
        assertEquals(2L, AssetLocationService.matchByName(nodes, "动科部").getId());
    }

    @Test
    void multipleHitsTakeSmallestId() {
        List<AssetLocation> nodes = List.of(
                node(30L, null, "办公室151"),
                node(5L, null, "办公室151")
        );
        assertEquals(5L, AssetLocationService.matchByName(nodes, "办公室151").getId());
    }

    @Test
    void internalWhitespaceCollapsedForBothSides() {
        List<AssetLocation> nodes = List.of(node(9L, null, "浦东校区实验动物科学部  办公室151"));
        assertEquals(9L, AssetLocationService.matchByName(nodes, "浦东校区实验动物科学部 办公室151").getId());
    }

    @Test
    void noMatchOrBlankReturnsNull() {
        List<AssetLocation> nodes = List.of(node(1L, null, "动科部"));
        assertNull(AssetLocationService.matchByName(nodes, "不存在的节点"));
        assertNull(AssetLocationService.matchByName(nodes, "   "));
        assertNull(AssetLocationService.matchByName(nodes, null));
    }
}
