package com.example.demo.modules.aro.dto;

import java.util.Map;

/**
 * CAS 登录会话上下文，用于多步 CAS 登录流程。
 */
public class CasLoginSession {
    private String jsessionId;
    private String execution;
    private String lt;          // login ticket (CAS 3.x+)
    private String eventId;
    private Map<String, String> additionalParams;  // other hidden form fields

    public String getJsessionId() { return jsessionId; }
    public void setJsessionId(String jsessionId) { this.jsessionId = jsessionId; }

    public String getExecution() { return execution; }
    public void setExecution(String execution) { this.execution = execution; }

    public String getLt() { return lt; }
    public void setLt(String lt) { this.lt = lt; }

    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }

    public Map<String, String> getAdditionalParams() { return additionalParams; }
    public void setAdditionalParams(Map<String, String> additionalParams) { this.additionalParams = additionalParams; }
}
