package com.example.demo.modules.student.dto;

public class StudentQrVerifyResponse {
    private boolean verified;
    private String userId;
    private String name;
    private String departmentName;
    private String projectGroupName;
    private String message;

    public static StudentQrVerifyResponse success(String userId, String name,
            String departmentName, String projectGroupName) {
        StudentQrVerifyResponse r = new StudentQrVerifyResponse();
        r.verified = true;
        r.userId = userId;
        r.name = name;
        r.departmentName = departmentName;
        r.projectGroupName = projectGroupName;
        return r;
    }

    public static StudentQrVerifyResponse fail(String message) {
        StudentQrVerifyResponse r = new StudentQrVerifyResponse();
        r.verified = false;
        r.message = message;
        return r;
    }

    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDepartmentName() { return departmentName; }
    public void setDepartmentName(String departmentName) { this.departmentName = departmentName; }
    public String getProjectGroupName() { return projectGroupName; }
    public void setProjectGroupName(String projectGroupName) { this.projectGroupName = projectGroupName; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
