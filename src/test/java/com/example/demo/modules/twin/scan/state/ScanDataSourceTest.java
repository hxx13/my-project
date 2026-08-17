package com.example.demo.modules.twin.scan.state;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ScanDataSourceTest {

    @Test
    void resolve_lowercaseLocal_returnsLocal() {
        assertEquals(ScanDataSource.LOCAL, ScanDataSource.resolve("local"));
    }

    @Test
    void resolve_uppercaseLocal_returnsLocal() {
        assertEquals(ScanDataSource.LOCAL, ScanDataSource.resolve("LOCAL"));
    }

    @Test
    void resolve_aro_returnsAro() {
        assertEquals(ScanDataSource.ARO, ScanDataSource.resolve("aro"));
    }

    @Test
    void resolve_null_returnsAro() {
        assertEquals(ScanDataSource.ARO, ScanDataSource.resolve(null));
    }

    @Test
    void resolve_empty_returnsAro() {
        assertEquals(ScanDataSource.ARO, ScanDataSource.resolve(""));
    }

    @Test
    void resolve_unknown_returnsAro() {
        assertEquals(ScanDataSource.ARO, ScanDataSource.resolve("随便"));
    }
}
