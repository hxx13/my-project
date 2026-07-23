package com.example.demo.modules.aro.dto;

import lombok.Data;

/**
 * CAS serviceValidate XML 响应中解析出的用户身份信息。
 * XML 结构：
 * &lt;cas:serviceResponse&gt;
 *   &lt;cas:authenticationSuccess&gt;
 *     &lt;cas:user&gt;YF0408&lt;/cas:user&gt;
 *     &lt;cas:username&gt;位亚磊&lt;/cas:username&gt;
 *     &lt;cas:account&gt;YF0408&lt;/cas:account&gt;
 *     &lt;cas:id&gt;ff808081...&lt;/cas:id&gt;
 *     ...
 *   &lt;/cas:authenticationSuccess&gt;
 * &lt;/cas:serviceResponse&gt;
 */
@Data
public class CasUserInfo {
    /** CAS 用户名（user），同 account */
    private String user;

    /** 人员真实姓名 */
    private String username;

    /** CAS 账号名 */
    private String account;

    /** CAS 系统中的 hex id，如 "ff808081..." */
    private String id;

    /** 邮箱 */
    private String email;

    /** 手机号 */
    private String phone;

    /** 性别 */
    private String sex;

    /** 用户类型 */
    private String usertype;

    /** 教育 ID */
    private String eduid;
}
