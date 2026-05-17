package com.example.demo.common.web;

import com.example.demo.common.dto.Result;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 避免误 POST /login 时落入静态资源处理器并抛出 NoResourceFoundException。
 */
@RestController
public class LegacyLoginPathController {

    @PostMapping("/login")
    public Result<Void> rejectWrongLoginPath() {
        return Result.error("请使用 POST /api/auth/login/web 登录，勿直接请求 /login");
    }
}
