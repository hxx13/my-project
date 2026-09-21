package com.example.demo.modules.student.dto;

/**
 * 全新用户注册请求（新人员总闸门 app.registration.open 开启后可用）。
 * 账号名/姓名/手机号/性别/密码必填；工号学号/邮箱/idpUid 选填。不收身份证号。
 *
 * <p>账号名与手机号是**两个独立字段**：账号名是登录名，手机号只是「也可以用来登录」的另一条路径。
 */
public class NewUserRegisterRequest {
    private String username;     // 账号名（必填，登录名）
    private String name;        // 姓名（必填）
    private String mobilePhone;  // 手机号（必填，独立字段，不作为登录名；但登录时也认它）
    private Integer gender;      // 性别（必填，0=未知 1=男 2=女）
    private String jobNumber;    // 工号/学号（选填）
    private String email;        // 邮箱（选填）
    private String password;     // 密码（必填）
    private String idpUid;       // 统一认证稳定标识（选填，非空则写 user_auth_binding）

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getMobilePhone() { return mobilePhone; }
    public void setMobilePhone(String mobilePhone) { this.mobilePhone = mobilePhone; }
    public Integer getGender() { return gender; }
    public void setGender(Integer gender) { this.gender = gender; }
    public String getJobNumber() { return jobNumber; }
    public void setJobNumber(String jobNumber) { this.jobNumber = jobNumber; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getIdpUid() { return idpUid; }
    public void setIdpUid(String idpUid) { this.idpUid = idpUid; }
}
