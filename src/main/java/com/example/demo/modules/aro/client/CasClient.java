package com.example.demo.modules.aro.client;

import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.dto.CasUserInfo;

/**
 * CAS 协议客户端，封装与 ARO/CAS 服务器的通信。
 */
public interface CasClient {

    /**
     * 用 CAS ticket 换取 ARO JWT Token。
     * 调用 ARO loginAuth 接口，解析返回的 JWT payload 提取用户身份。
     */
    CasTokenInfo exchangeTicket(String ticket);

    /**
     * 直接调用 CAS serviceValidate 验证 ticket 并解析 XML 获取用户身份。
     */
    CasUserInfo validateTicket(String ticket, String serviceUrl);

    /**
     * 使用保存的 CASTGC Cookie 获取新的 service ticket。
     * 返回 Location 响应头中的 ST-xxx ticket。
     */
    String getServiceTicket(String tgc, String serviceUrl);

    /**
     * CAS 登出，fire-and-forget。
     */
    void logout();
}
