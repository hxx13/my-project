package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 转移审核门槛的回归测试（{@code CageOperationService.needApproval}）。
 *
 * <p>不构造 {@link CageOperationService}（构造器 27 个依赖，起一套 mock 只为测一个布尔表达式不值当），
 * 直接测抽出来的静态纯函数 —— 它是 {@code submit()} 里「需不需要审核」的唯一入口。
 *
 * <p>口径：转移（transfer）无论学生还是教职工提交都要过三签；分笼（divide）仍只拦学生提交的。
 */
class CageOperationServiceNeedApprovalTest {

    @Test
    void 教职工提交转移_所属人要求审核_需要审核() {
        assertTrue(CageOperationService.needApproval(false, true, CageOpRequest.TYPE_TRANSFER));
    }

    @Test
    void 教职工提交分笼_所属人要求审核_仍直接执行() {
        assertFalse(CageOperationService.needApproval(false, true, CageOpRequest.TYPE_DIVIDE));
    }

    @Test
    void 学生提交转移_所属人要求审核_需要审核() {
        assertTrue(CageOperationService.needApproval(true, true, CageOpRequest.TYPE_TRANSFER));
    }

    @Test
    void 学生提交分笼_所属人要求审核_需要审核() {
        assertTrue(CageOperationService.needApproval(true, true, CageOpRequest.TYPE_DIVIDE));
    }

    @Test
    void 教职工提交转移_所属人不要审核_直接执行() {
        assertFalse(CageOperationService.needApproval(false, false, CageOpRequest.TYPE_TRANSFER));
    }

    @Test
    void 学生提交分笼_所属人不要审核_直接执行() {
        assertFalse(CageOperationService.needApproval(true, false, CageOpRequest.TYPE_DIVIDE));
    }
}
