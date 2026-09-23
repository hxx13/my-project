package com.example.demo.modules.personnel.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** 只覆盖「不联网」的分支：放行规则与后缀解析。下载那段靠集成环境验。 */
class PersonnelHeadLocalizerTest {

    private final PersonnelHeadLocalizer localizer = new PersonnelHeadLocalizer("build/test-uploads");

    @Test
    void passesThroughBlankAndNonRemoteValues() {
        assertNull(localizer.localize(null));
        assertEquals("", localizer.localize(""));
        // 已经是本地地址：原样返回，不能再去下载
        assertEquals("/api/upload/files/personnel-head/abc.png",
                localizer.localize("/api/upload/files/personnel-head/abc.png"));
        assertEquals("head.png", localizer.localize("head.png"));
    }

    @Test
    void guessesImageExtension() {
        assertEquals("png", PersonnelHeadLocalizer.extOf(
                "https://aro.shsmu.edu.cn/jtu_files//2026/03-18/1b18872f-source.png"));
        assertEquals("jpg", PersonnelHeadLocalizer.extOf("http://8.136.111.166/jtu_files/a.JPEG"));
        assertEquals("png", PersonnelHeadLocalizer.extOf("https://x/a.png?v=1"));
        // 没有后缀 / 非图片后缀：按 png 存，别把 exe 原样落下
        assertEquals("png", PersonnelHeadLocalizer.extOf("https://x/no-ext"));
        assertEquals("png", PersonnelHeadLocalizer.extOf("https://x/a.exe"));
    }
}
