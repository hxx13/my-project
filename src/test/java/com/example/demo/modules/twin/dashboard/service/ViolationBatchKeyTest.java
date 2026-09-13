package com.example.demo.modules.twin.dashboard.service;

import org.junit.jupiter.api.Test;
import java.util.HashSet;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class ViolationBatchKeyTest {
    @Test
    void keyIsFixedLengthSortableAndUnique() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 2000; i++) {
            String k = TwinStudentViolationService.newBatchKey();
            assertEquals(21, k.length(), "定长 21：13 位毫秒 + 8 位十六进制");
            assertTrue(k.matches("[0-9a-f]{21}"), "只含小写十六进制字符");
            assertTrue(seen.add(k), "同一批次内必须唯一");
        }
    }

    @Test
    void laterKeySortsAfterEarlier() throws Exception {
        String a = TwinStudentViolationService.newBatchKey();
        Thread.sleep(3);
        String b = TwinStudentViolationService.newBatchKey();
        assertTrue(b.compareTo(a) > 0, "字典序应等于时间序（这是 SQL ORDER BY batch_id 成块排序的依据）");
    }
}
