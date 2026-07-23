package com.example.demo.modules.aro.client;

import com.example.demo.modules.aro.dto.CasLoginSession;
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

    /**
     * 第一步：获取 CAS 登录页面，提取 execution token 和 JSESSIONID。
     * 返回的 CasLoginSession 可用作后续 {@link #fetchCaptcha} 和 {@link #submitLogin} 的上下文。
     */
    CasLoginSession fetchLoginSession();

    /**
     * 第二步：用步骤一的 session 获取验证码图片（PNG bytes）。
     */
    byte[] fetchCaptcha(CasLoginSession session);

    /**
     * 第三步：提交登录表单，返回 CASTGC Cookie 值。
     *
     * @param session  步骤一获取的会话
     * @param username CAS 账号
     * @param password CAS 密码
     * @param captcha  验证码
     * @param service  目标服务 URL（可为空，仅设置 CASTGC）
     * @return CASTGC Cookie 值（TGT-xxx）
     * @throws CasLoginException 登录失败（密码错误/验证码错误等）
     */
    String submitLogin(CasLoginSession session, String username, String password,
                       String captcha, String service) throws CasLoginException;

    /**
     * 完整流程：从 CASTGC → ARO service ticket → ARO JWT。
     * 等价于 getServiceTicket + exchangeTicket。
     */
    default CasTokenInfo acquireTokenViaTgc(String tgc) {
        String ticket = getServiceTicket(tgc, "https://aro.shsmu.edu.cn/#/jtu/api/loginAuth");
        if (ticket == null) return null;
        return exchangeTicket(ticket);
    }
}
