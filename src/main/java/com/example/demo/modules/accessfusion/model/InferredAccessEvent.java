package com.example.demo.modules.accessfusion.model;

import com.example.demo.modules.accessfusion.entity.AccessRawEvent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class InferredAccessEvent {
    public AccessRawEvent raw;
    public String direction;
    public int accessType;
    public String inferenceMethod;
    public int confidence;
    public final List<String> flags = new ArrayList<>();
    public boolean needsReview;
    public String roomId;
    public String roomName;
    public String areaName;
    public String floorName;
    public String projectGroupNames;
    public LocalDateTime eventTime;
}
