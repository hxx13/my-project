package com.example.demo.common.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 把「POST + {@code X-HTTP-Method-Override: DELETE}」还原成 DELETE 请求。
 *
 * <p>起因（2026-10-10 生产实测）：小程序走公网域名（arodlas）时，**链路上某一层不接受 DELETE**
 * —— 请求根本到不了应用。证据是服务端的访问日志里**一条来自小程序的 DELETE 都没有**，
 * 而同一天网页端走内网地址（aroultra）的 DELETE 全部返回 200。表现：真机上所有删除操作都弹
 * 一张 502 的 HTML 页，模拟器（直连本机后端、不经过那条链路）却一切正常。
 *
 * <p>为什么不逐个改成 POST 接口：小程序里 DELETE 调用有近 50 处（人员/报修/订购/资产/门禁/
 * 违规/AI 会话…），一个个改要动几十个接口和调用点。用方法覆盖，客户端只在**唯一的请求出口**
 * 改一处（{@code springAuth.callSpringDirect}），后端只加这一个过滤器，调用点与接口都不用动。
 *
 * <p>为什么包一层就够：Spring MVC 的映射匹配读的是 {@code request.getMethod()}，包装后它就是
 * DELETE，照常落到各控制器原有的 {@code @DeleteMapping} 上，业务代码零改动。
 *
 * <p>只接受 DELETE 一个覆盖值 —— 别让这个头变成"任意改写请求方法"的通用后门。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class HttpMethodOverrideFilter extends OncePerRequestFilter {

    private static final String HEADER = "X-HTTP-Method-Override";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String override = request.getHeader(HEADER);
        if (override == null || !"DELETE".equalsIgnoreCase(override.trim())
                || !"POST".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        HttpServletRequest wrapped = new HttpServletRequestWrapper(request) {
            @Override
            public String getMethod() {
                return "DELETE";
            }
        };
        filterChain.doFilter(wrapped, response);
    }
}
