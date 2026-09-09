package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.service.AssetService.MoveRemarkParts;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** MOVE 留痕 remark「旧地点 → 新地点」拆分：纯函数契约 */
class AssetMoveRemarkSplitTest {

    @Test
    void splitsAroundArrow() {
        MoveRemarkParts p = AssetService.splitMoveRemark("A → B");
        assertEquals("A", p.from());
        assertEquals("B", p.to());
    }

    @Test
    void splitsFullPathWithSpaces() {
        MoveRemarkParts p = AssetService.splitMoveRemark("一号楼 / 201 → 二号楼 / 305");
        assertEquals("一号楼 / 201", p.from());
        assertEquals("二号楼 / 305", p.to());
    }

    @Test
    void onlyFirstArrowSplits() {
        MoveRemarkParts p = AssetService.splitMoveRemark("A → B → C");
        assertEquals("A", p.from());
        assertEquals("B → C", p.to());
    }

    @Test
    void noArrowKeepsWholeTextAsTo() {
        MoveRemarkParts p = AssetService.splitMoveRemark("A → B".replace("→", "-"));
        assertNull(p.from());
        assertEquals("A - B", p.to());
    }

    @Test
    void blankOrNullYieldsNulls() {
        assertNull(AssetService.splitMoveRemark(null).from());
        assertNull(AssetService.splitMoveRemark(null).to());
        assertNull(AssetService.splitMoveRemark("   ").from());
        assertNull(AssetService.splitMoveRemark("   ").to());
    }

    @Test
    void arrowWithoutSpacesIsNotSplit() {
        MoveRemarkParts p = AssetService.splitMoveRemark("A→B");
        assertNull(p.from());
        assertEquals("A→B", p.to());
    }

    @Test
    void extraSpacesAroundArrowAreTrimmed() {
        MoveRemarkParts p = AssetService.splitMoveRemark("A  →  B");
        assertEquals("A", p.from());
        assertEquals("B", p.to());
    }
}
