package com.example.demo.modules.agv.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * AGV 上位机 /agv/statusall 响应映射。
 * 四台小车的 vehicle_id 当前全部返回 "AMB-01"，实际唯一标识是 current_ip。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class AgvRobotStatus {

    @JsonProperty("ret_code")
    private int retCode;

    @JsonProperty("current_ip")
    private String currentIp;

    @JsonProperty("vehicle_id")
    private String vehicleId;

    @JsonProperty("battery_level")
    private Double batteryLevel;

    private Boolean charging;
    private Boolean blocked;
    private Boolean emergency;

    @JsonProperty("task_status")
    private Integer taskStatus;

    private Double x;
    private Double y;
    private Double angle;
    private Double confidence;

    @JsonProperty("current_map")
    private String currentMap;

    @JsonProperty("current_station")
    private String currentStation;

    @JsonProperty("reloc_status")
    private Integer relocStatus;

    @JsonProperty("loadmap_status")
    private Integer loadmapStatus;

    private Double odo;

    @JsonProperty("total_time")
    private Long totalTime;

    private Integer rssi;
    private String ssid;

    @JsonProperty("driver_emc")
    private Boolean driverEmc;

    @JsonProperty("robot_note")
    private String robotNote;

    @JsonProperty("create_on")
    private String createOn;

    @JsonProperty("fork_height")
    private Double forkHeight;

    @JsonProperty("fork_height_in_place")
    private Boolean forkHeightInPlace;

    @JsonProperty("jack_enable")
    private Boolean jackEnable;

    @JsonProperty("jack_error_code")
    private Integer jackErrorCode;

    @JsonProperty("jack_isFull")
    private Boolean jackIsFull;

    @JsonProperty("jack_mode")
    private Boolean jackMode;

    @JsonProperty("jack_state")
    private Integer jackState;

    private List<String> errors;
    private List<String> fatals;
    private List<String> warnings;
    private List<String> notices;

    @JsonProperty("DI")
    private List<DiChannel> di;

    // ---- accessors ----

    public int getRetCode() { return retCode; }
    public String getCurrentIp() { return currentIp; }
    public String getVehicleId() { return vehicleId; }
    public Double getBatteryLevel() { return batteryLevel; }
    public Boolean getCharging() { return charging; }
    public Boolean getBlocked() { return blocked; }
    public Boolean getEmergency() { return emergency; }
    public Integer getTaskStatus() { return taskStatus; }
    public Double getX() { return x; }
    public Double getY() { return y; }
    public Double getAngle() { return angle; }
    public Double getConfidence() { return confidence; }
    public String getCurrentMap() { return currentMap; }
    public String getCurrentStation() { return currentStation; }
    public Integer getRelocStatus() { return relocStatus; }
    public Integer getLoadmapStatus() { return loadmapStatus; }
    public Double getOdo() { return odo; }
    public Long getTotalTime() { return totalTime; }
    public Integer getRssi() { return rssi; }
    public String getSsid() { return ssid; }
    public Boolean getDriverEmc() { return driverEmc; }
    public String getRobotNote() { return robotNote; }
    public String getCreateOn() { return createOn; }
    public Double getForkHeight() { return forkHeight; }
    public Boolean getForkHeightInPlace() { return forkHeightInPlace; }
    public Boolean getJackEnable() { return jackEnable; }
    public Integer getJackErrorCode() { return jackErrorCode; }
    public Boolean getJackIsFull() { return jackIsFull; }
    public Boolean getJackMode() { return jackMode; }
    public Integer getJackState() { return jackState; }
    public List<String> getErrors() { return errors; }
    public List<String> getFatals() { return fatals; }
    public List<String> getWarnings() { return warnings; }
    public List<String> getNotices() { return notices; }
    public List<DiChannel> getDi() { return di; }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DiChannel {
        private int id;
        private String source;
        private boolean status;
        private boolean valid;
        public int getId() { return id; }
        public String getSource() { return source; }
        public boolean isStatus() { return status; }
        public boolean isValid() { return valid; }
    }
}
