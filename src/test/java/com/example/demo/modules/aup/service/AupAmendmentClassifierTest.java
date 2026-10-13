package com.example.demo.modules.aup.service;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 修订等级判定：小修/大修/禁改的分流与混合触发规则。
 */
class AupAmendmentClassifierTest {

    private Map<String, String> levels() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("A1.period", "MAJOR");
        m.put("A1.name", "LOCKED");
        m.put("A2.address", "MINOR");
        m.put("B5.blocks", "MAJOR");
        return m;
    }

    private static final String OLD =
            "{\"A1.period\":\"2026-01-01\",\"A1.name\":\"课题甲\",\"A2.address\":\"A楼\",\"B5.blocks\":[{\"species\":\"SD大鼠\"}]}";

    @Test
    void unchangedContentIsNotAnAmendment() {
        AupAmendmentClassifier.Classification c =
                AupAmendmentClassifier.classify(levels(), OLD, OLD);
        assertTrue(c.isEmpty());
        assertFalse(c.hasMajor());
        assertFalse(c.hasLocked());
    }

    @Test
    void minorOnlyChangeSavesDirectly() {
        String neu = OLD.replace("A楼", "B楼");
        AupAmendmentClassifier.Classification c =
                AupAmendmentClassifier.classify(levels(), OLD, neu);
        assertEquals(1, c.minor().size());
        assertTrue(c.minor().contains("A2.address"));
        assertFalse(c.hasMajor());
        assertFalse(c.hasLocked());
    }

    @Test
    void majorChangeRequiresNewVersion() {
        String neu = OLD.replace("2026-01-01", "2027-01-01");
        AupAmendmentClassifier.Classification c =
                AupAmendmentClassifier.classify(levels(), OLD, neu);
        assertTrue(c.hasMajor());
        assertTrue(c.major().contains("A1.period"));
    }

    @Test
    void mixedMinorAndMajorIsTreatedAsMajor() {
        String neu = OLD.replace("2026-01-01", "2027-01-01").replace("A楼", "B楼");
        AupAmendmentClassifier.Classification c =
                AupAmendmentClassifier.classify(levels(), OLD, neu);
        assertTrue(c.hasMajor());
        assertTrue(c.minor().contains("A2.address"));
    }

    @Test
    void lockedChangeIsRejected() {
        String neu = OLD.replace("课题甲", "课题乙");
        AupAmendmentClassifier.Classification c =
                AupAmendmentClassifier.classify(levels(), OLD, neu);
        assertTrue(c.hasLocked());
        assertTrue(c.locked().contains("A1.name"));
    }

    /** 容器字段按整块比较：增删一行即算改动（覆盖「增删附表格」这类结构变化）。 */
    @Test
    void containerRowChangeCountsAsFieldChange() {
        String neu = OLD.replace("[{\"species\":\"SD大鼠\"}]",
                "[{\"species\":\"SD大鼠\"},{\"species\":\"C57BL/6\"}]");
        AupAmendmentClassifier.Classification c =
                AupAmendmentClassifier.classify(levels(), OLD, neu);
        assertTrue(c.hasMajor());
        assertTrue(c.major().contains("B5.blocks"));
    }

    @Test
    void missingOldValueEqualToBlankNewValueIsNoChange() {
        AupAmendmentClassifier.Classification c =
                AupAmendmentClassifier.classify(levels(), "{}", "{\"A2.address\":\"\"}");
        assertTrue(c.isEmpty());
    }

    /** 条件隐藏的字段提交时会被清空，与旧值比对必然不同——但那不算用户改动。 */
    @Test
    void hiddenFieldsAreIgnored() {
        String neu = OLD.replace("\"A2.address\":\"A楼\"", "\"A2.address\":\"\"");
        java.util.Set<String> hidden = java.util.Set.of("A2.address");

        assertTrue(AupAmendmentClassifier.classify(levels(), OLD, neu, hidden).isEmpty());
        // 不声明隐藏时，同样两份数据会被判成一次小修
        assertFalse(AupAmendmentClassifier.classify(levels(), OLD, neu).isEmpty());
    }

    @Test
    void levelParsingDefaultsToMinor() {
        assertEquals("MINOR", AupAmendmentClassifier.parseLevel(null));
        assertEquals("MINOR", AupAmendmentClassifier.parseLevel("{}"));
        assertEquals("MINOR", AupAmendmentClassifier.parseLevel("not-json"));
        assertEquals("MAJOR", AupAmendmentClassifier.parseLevel("{\"amendmentLevel\":\"major\"}"));
        assertEquals("LOCKED", AupAmendmentClassifier.parseLevel("{\"amendmentLevel\":\"LOCKED\"}"));
    }
}
