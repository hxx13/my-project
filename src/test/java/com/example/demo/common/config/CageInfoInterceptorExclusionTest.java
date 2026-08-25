package com.example.demo.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;
import org.springframework.http.server.PathContainer;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 守住 {@link WebMvcConfig} 里 AdminAuthInterceptor 对笼位表单读路径的排除边界。
 *
 * 排除是为了让 MEMBER（学生）能读表单 —— 控制器内已有 requireMember + 课题组脱敏。
 * 危险点在单层通配的覆盖范围：必须命中 /codelists/{code}，但绝不能顺带放过
 * /codelists/{code}/items 这类只允许 ADMIN 的深层写路径。
 */
class CageInfoInterceptorExclusionTest {

    /** 与 WebMvcConfig.addInterceptors 中的 excludePathPatterns 保持一致。 */
    private static final String[] EXCLUDED = {
            "/api/admin/cage-info/templates/*",
            "/api/admin/cage-info/values/*",
            "/api/admin/cage-info/codelists/*",
    };

    private static final PathPatternParser PARSER = new PathPatternParser();

    private static boolean isExcluded(String path) {
        PathContainer container = PathContainer.parsePath(path);
        for (String raw : EXCLUDED) {
            PathPattern pattern = PARSER.parse(raw);
            if (pattern.matches(container)) {
                return true;
            }
        }
        return false;
    }

    @Test
    void studentReadablePaths_areExcludedFromAdminGate() {
        assertTrue(isExcluded("/api/admin/cage-info/templates/cage_detail"));
        assertTrue(isExcluded("/api/admin/cage-info/values/12345"));
        assertTrue(isExcluded("/api/admin/cage-info/codelists/animal_sex"));
    }

    @Test
    void deeperWritePaths_stayBehindAdminGate() {
        // 码表选项增删改 —— 控制器内 requireAdmin，必须仍由拦截器先卡一道
        assertFalse(isExcluded("/api/admin/cage-info/codelists/animal_sex/items"));
        assertFalse(isExcluded("/api/admin/cage-info/codelists/animal_sex/items/7"));
        assertFalse(isExcluded("/api/admin/cage-info/codelists/animal_sex/usage"));
        assertFalse(isExcluded("/api/admin/cage-info/codelists/animal_sex/approve"));
        assertFalse(isExcluded("/api/admin/cage-info/templates/cage_detail/publish"));
        assertFalse(isExcluded("/api/admin/cage-info/templates/cage_detail/unfreeze"));
    }

    @Test
    void listAndUnrelatedAdminPaths_stayBehindAdminGate() {
        // 列表端点在基路径上，不应被单层通配命中
        assertFalse(isExcluded("/api/admin/cage-info/templates"));
        assertFalse(isExcluded("/api/admin/cage-info/codelists"));
        // 字段字典 / 字典套 / 审计等配置面完全不在排除范围内
        assertFalse(isExcluded("/api/admin/cage-info/fields"));
        assertFalse(isExcluded("/api/admin/cage-info/fields/12"));
        assertFalse(isExcluded("/api/admin/cage-info/dictionaries/cage/structure"));
        assertFalse(isExcluded("/api/admin/cage-claims/pending"));
        assertFalse(isExcluded("/api/admin/cage-form/audit"));
    }
}
