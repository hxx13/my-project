package com.example.demo.modules.student.dto;

public class StudentRegisterRequest {
    private String userId;      // 19位 ARO user_id（从QR码解码得到）
    private String username;    // 用户自设账号
    private String password;    // 用户自设密码

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
