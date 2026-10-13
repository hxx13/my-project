package com.example.demo.modules.twin.common.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 课题组搜索的兜底排序 —— 关键词一个字都没精确命中时该给什么。
 *
 * <p>真机（2026-10-13）：用户找「郑均克」的组（库里叫「郑俊克的课题组」），精确子串一个字都不命中，
 * 退成按「郑」搜之后端出来的是「郑杰的课题组」「郑铨的课题组」—— 只跟用户共一个姓。
 * 用户的原话是「我是三个音节，问我两个音节的，太死板」。
 */
class PersonnelProjectGroupUtilTest {

    private static final List<String> FIELDS = List.of(
            "郑俊克的课题组", "郑杰的课题组", "郑铨的课题组", "卢今的课题组");

    @Test
    @DisplayName("打错一个同音字仍能把三字名那一组挑出来；只共一个姓的两字名一律不要")
    void typoToleratedButOnlyComparableLengths() {
        assertEquals(List.of("郑俊克的课题组"),
                PersonnelProjectGroupUtil.rankGroupsBySimilarity(FIELDS, "郑均克", 10));
    }

    @Test
    @DisplayName("一个都不像就给空 —— 宁可说查不到，也不端一堆不相干的人")
    void unrelatedKeywordOffersNothing() {
        assertTrue(PersonnelProjectGroupUtil.rankGroupsBySimilarity(FIELDS, "王大力", 10).isEmpty());
    }

    @Test
    @DisplayName("比的是组名里的 PI 前缀，不是整个组名（否则「的课题组」这层壳白送四分）")
    void comparesPiPrefixNotWholeGroupName() {
        assertTrue(PersonnelProjectGroupUtil.rankGroupsBySimilarity(
                List.of("郑杰的课题组"), "郑均克", 10).isEmpty());
    }
}
