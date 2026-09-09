package com.example.demo.modules.asset.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** 存放地点名称归一化：播种与 CRUD 共用的纯函数契约 */
class AssetLocationSeedTest {

    @Test
    void collapsesConsecutiveWhitespace() {
        assertEquals("浦东校区实验动物科学部 办公室154",
                AssetLocationService.normalizeLocationName("浦东校区实验动物科学部  办公室154"));
    }

    @Test
    void blankBecomesNull() {
        assertNull(AssetLocationService.normalizeLocationName("  "));
    }

    @Test
    void nullStaysNull() {
        assertNull(AssetLocationService.normalizeLocationName(null));
    }

    @Test
    void plainNameUntouched() {
        assertEquals("动科部3A", AssetLocationService.normalizeLocationName("动科部3A"));
    }

    @Test
    void fullWidthSpaceAlsoCollapsed() {
        assertEquals("浦东校区 实验动物科学部",
                AssetLocationService.normalizeLocationName("　浦东校区　　实验动物科学部　"));
    }

    @Test
    void tabsAndNewlinesCollapsedAndTrimmed() {
        assertEquals("A B", AssetLocationService.normalizeLocationName("\tA\n\n B\t"));
        assertNull(AssetLocationService.normalizeLocationName("\t\n"));
    }
}
