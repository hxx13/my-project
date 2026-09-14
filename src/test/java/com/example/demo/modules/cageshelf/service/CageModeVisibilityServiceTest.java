package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 学生**模式**权限判定的回归（`canStudentMode`）。
 *
 * <p>核心是**能力码前缀别拿错**：学生模式是 `cage.student.mode.<mode>`，
 * 而本类里的 {@code modeCapability} 是教职工的 `cage.mode.<mode>` —— 两个同名方法、前缀不同。
 * 拿错就会查一个永远不存在的能力码，把归档入口整体锁死（或反过来把教职工模式放开）。
 */
@ExtendWith(MockitoExtension.class)
class CageModeVisibilityServiceTest {

    @Mock private CagePermissionService permissionService;

    private CageModeVisibilityService service;

    @BeforeEach
    void setUp() {
        service = new CageModeVisibilityService(permissionService);
    }

    private static User student() {
        User u = new User();
        u.setId("ARO_1");
        return u;
    }

    @Test
    void canStudentModeAsksTheStudentCapabilityCode() {
        when(permissionService.identityCodesOf("ARO_1")).thenReturn(Set.of("LAB_MEMBER"));
        when(permissionService.canUse("cage.student.mode.archive", Set.of("LAB_MEMBER"))).thenReturn(true);

        assertTrue(service.canStudentMode(student(), "archive"));
        verify(permissionService).canUse(eq("cage.student.mode.archive"), any());
        verify(permissionService, never()).canUse(eq("cage.mode.archive"), any());
    }

    @Test
    void canStudentModeIsFalseWhenNotGranted() {
        when(permissionService.identityCodesOf("ARO_1")).thenReturn(Set.of("LAB_MEMBER"));
        when(permissionService.canUse("cage.student.mode.archive", Set.of("LAB_MEMBER"))).thenReturn(false);

        assertFalse(service.canStudentMode(student(), "archive"));
    }

    /** 空输入一律 false（控制器拿不准时不放行）。 */
    @Test
    void canStudentModeIsFailClosedOnBlankInput() {
        assertFalse(service.canStudentMode(null, "archive"));
        assertFalse(service.canStudentMode(student(), null));
        assertFalse(service.canStudentMode(student(), "  "));
    }
}
