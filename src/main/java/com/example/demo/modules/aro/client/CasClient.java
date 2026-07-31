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
     *
     * @deprecated ARO 的 loginAuth 端点只能在浏览器上下文（ARO 前端应用内）工作，
     *             服务器端 RestTemplate 调用始终返回 500。
     *             请改用 {@link #parseToken(String)} 接收浏览器获取的 ARO JWT。
     */
    @Deprecated
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
     * 解析 ARO JWT Token 的 payload（不验证签名），提取用户身份信息。
     * 适用于浏览器端获取 ARO Token 后回传给后端存储的场景。
     *
     * @param aroJwt ARO 签发的不透明 JWT（从 ARO localStorage.token 获取）
     * @return CasTokenInfo，解析失败返回 null
     */
    CasTokenInfo parseToken(String aroJwt);

    /**
     * 使用已有 ARO 会话（JSESSIONID）通过 loginAuth 获取新 Token。
     * 调用 ARO 的 /jtu/api/loginAuth?loginAuthType=CAS 端点，
     * 需要携带有效的 JSESSIONID Cookie 和 Referer 请求头。
     *
     * @param jsessionid ARO 服务端的 JSESSIONID Cookie 值
     * @return CasTokenInfo，获取失败返回 null
     */
    CasTokenInfo getTokenBySession(String jsessionid);

    /**
     * 使用已有的 ARO JWT Token 换取新 Token（自动续期）。
     * 通过将旧 Token 作为 HTTP Header 传递给 loginAuth 接口，
     * ARO 识别用户身份后颁发新 Token。
     *
     * @param oldToken 当前存储的 ARO JWT Token（未过期）
     * @return CasTokenInfo 包含新 Token，获取失败返回 null
     */
    CasTokenInfo refreshToken(String oldToken);

    /**
     * 使用 ARO 账号密码直接登录获取 Token。
     * 调用 ARO 的 /jtu/api/login 端点，无需验证码。
     *
     * @param account ARO 账号（如 YF0408）
     * @param password ARO 密码
     * @return CasTokenInfo，登录失败返回 null
     */
    CasTokenInfo loginWithCredentials(String account, String password);

    /**
     * CAS 登出，fire-and-forget。
     */
    void logout();
}
