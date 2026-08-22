package com.example.demo.modules.nhp.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class NhpTemplateSectionLabelsTest {

    @Test
    void prefersExplicitLabel() {
        assertEquals("显式名", NhpTemplateSectionLabels.resolve("D1", "显式名", "原子标题"));
    }

    @Test
    void fallsBackToCodeBeforeAtomTitle() {
        assertEquals("donor_profile", NhpTemplateSectionLabels.resolve("donor_profile", null, "供体档案"));
    }

    @Test
    void fallsBackToAtomTitleWhenCodeBlank() {
        assertEquals("供体档案", NhpTemplateSectionLabels.resolve(null, null, "供体档案"));
    }

    @Test
    void fallsBackToCodeWhenLabelBlank() {
        assertEquals("D1", NhpTemplateSectionLabels.resolve("D1", null, null));
        assertEquals("D1.01", NhpTemplateSectionLabels.resolve("D1.01", null, null));
    }

    @Test
    void unnamedWhenNothingUsable() {
        assertEquals(NhpTemplateSectionLabels.UNNAMED, NhpTemplateSectionLabels.resolve(null, null, null));
    }
}
