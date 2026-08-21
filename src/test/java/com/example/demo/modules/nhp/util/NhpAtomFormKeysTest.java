package com.example.demo.modules.nhp.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class NhpAtomFormKeysTest {

    @Test
    void dd1IsDistinctFromD1() {
        assertEquals("DD1", NhpAtomFormKeys.extractDomainCode("DD1"));
        assertEquals("D1", NhpAtomFormKeys.extractDomainCode("D1"));
        assertNotEquals(
                NhpAtomFormKeys.extractDomainCode("DD1"),
                NhpAtomFormKeys.extractDomainCode("D1"));
        assertEquals("DD1", NhpAtomFormKeys.atomFormKey("pig", "DD1"));
        assertEquals("monkey__DD1", NhpAtomFormKeys.atomFormKey("monkey", "DD1"));
    }

    @Test
    void fieldBelongsToDomainUsesExactDomainSegment() {
        assertTrue(NhpAtomFormKeys.fieldBelongsToDomain("DD1.01.001", "DD1"));
        assertFalse(NhpAtomFormKeys.fieldBelongsToDomain("DD1.01.001", "D1"));
        assertTrue(NhpAtomFormKeys.fieldBelongsToDomain("D1.01.001", "D1"));
        assertFalse(NhpAtomFormKeys.fieldBelongsToDomain("D1.01.001", "DD1"));
        assertFalse(NhpAtomFormKeys.fieldBelongsToDomain("D10.01.001", "D1"));
        assertEquals("DD1", NhpAtomFormKeys.domainOfFieldCode("DD1.02.003"));
        assertEquals("D1", NhpAtomFormKeys.domainOfFieldCode("D1.02.003"));
    }

    @Test
    void scopedFormKeyPreservesMultiDDomain() {
        var p = NhpAtomFormKeys.parse("monkey__DD1");
        assertNotNull(p);
        assertEquals("monkey", p.dictKey());
        assertEquals("DD1", p.domainCode());
    }

    @Test
    void canonicalPigDomainCollapsesDoubleD() {
        assertEquals("D1", NhpAtomFormKeys.canonicalPigDomainCode("DD1"));
        assertEquals("D10", NhpAtomFormKeys.canonicalPigDomainCode("DDD10"));
        assertEquals("D2", NhpAtomFormKeys.canonicalPigDomainCode("D2"));
        assertTrue(NhpAtomFormKeys.isBogusDoubleDBareAtom("DD2"));
        assertFalse(NhpAtomFormKeys.isBogusDoubleDBareAtom("D2"));
        assertFalse(NhpAtomFormKeys.isBogusDoubleDBareAtom("monkey__DD2"));
    }
}
