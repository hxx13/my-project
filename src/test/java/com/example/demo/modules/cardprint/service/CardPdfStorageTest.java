package com.example.demo.modules.cardprint.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 落盘契约：往返一致、路径穿越必须被拒。 */
class CardPdfStorageTest {

    @Test
    void storeThenReadRoundTrips(@TempDir Path dir) throws Exception {
        CardPdfStorage storage = new CardPdfStorage(dir.toString());
        byte[] data = "hello 卡牌".getBytes(StandardCharsets.UTF_8);
        String rel = storage.store(data);
        assertTrue(rel.endsWith(".pdf"), rel);
        assertArrayEquals(data, storage.read(rel));
    }

    @Test
    void rejectsPathTraversal(@TempDir Path dir) {
        CardPdfStorage storage = new CardPdfStorage(dir.toString());
        assertThrows(IllegalArgumentException.class, () -> storage.read("../../etc/passwd"));
        assertThrows(IllegalArgumentException.class, () -> storage.read("/etc/passwd"));
        assertThrows(IllegalArgumentException.class, () -> storage.read("../card-print-evil/x.pdf"));
    }

    @Test
    void deleteMissingIsSilentAndReadMissingThrows(@TempDir Path dir) {
        CardPdfStorage storage = new CardPdfStorage(dir.toString());
        assertDoesNotThrow(() -> storage.delete("20260101/nope.pdf"));
        assertThrows(NoSuchFileException.class, () -> storage.read("20260101/nope.pdf"));
    }

    @Test
    void storeCreatesNestedDateDirectory(@TempDir Path dir) throws Exception {
        CardPdfStorage storage = new CardPdfStorage(dir.toString());
        String rel = storage.store(new byte[]{1, 2, 3});
        assertTrue(Files.exists(dir.resolve(rel)), "文件应落在 root 下的日期目录里");
        assertEquals(1, rel.split("/").length - 1);
    }
}
