package com.example.demo.modules.twin.common.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 中文姓名的「像不像」—— 全站（免冻找人、课题组搜索、申领审计的候选收窄）共用这一份判据。
 *
 * <p>它要同时挡住两种错：**该认的没认**（同音字写成另一个字就查无此人）与
 * **不该认的认了**（三字名对上只共一个姓的两字名，用户原话「我是三个音节，问我两个音节的」）。
 */
class ChineseNameSimilarityTest {

    @Test
    @DisplayName("全谐音也要认：三个字全不同、念起来一样（「张军」↔「章钧」）")
    void pureHomophoneStillMatches() {
        assertTrue(ChineseNameSimilarity.score("章钧", "张军") > 0,
                "生活里写错名字最常见的形态就是谐音，要求「必须有同字」会把这类整片漏掉");
    }

    @Test
    @DisplayName("同字比同音可信：字面一样的排在同音的之前")
    void exactBeatsSound() {
        assertTrue(ChineseNameSimilarity.score("王毓菲", "王毓菲")
                        > ChineseNameSimilarity.score("王玉菲", "王毓菲"),
                "计分上同字要压过同音，排序时字面相同的才在最前");
    }

    @Test
    @DisplayName("只共一个姓的两字名出局（「郑杰」对不上三字名「郑均克」）")
    void sharedSurnameOnlyIsNotAMatch() {
        assertEquals(0, ChineseNameSimilarity.score("郑杰", "郑均克"));
        assertEquals(0, ChineseNameSimilarity.score("郑铨", "郑均克"));
    }

    @Test
    @DisplayName("长度差超过一个字、或一个字都对不上，一律不算")
    void guardsAgainstLooseMatches() {
        assertEquals(0, ChineseNameSimilarity.score("郑", "郑均克"), "长度差太多");
        assertEquals(0, ChineseNameSimilarity.score("王大力", "郑均克"), "一个字都对不上");
        assertEquals(0, ChineseNameSimilarity.score("", "郑均克"));
        assertEquals(0, ChineseNameSimilarity.score("郑均克", null));
    }
}
