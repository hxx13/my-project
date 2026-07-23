package com.example.demo.modules.analytics.dto;

public class AnalyticsReportDescriptorDto {
    private String key;
    private String title;
    private String description;
    private String category;
    private boolean available;

    public AnalyticsReportDescriptorDto() {
    }

    public AnalyticsReportDescriptorDto(String key, String title, String description, String category, boolean available) {
        this.key = key;
        this.title = title;
        this.description = description;
        this.category = category;
        this.available = available;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public boolean isAvailable() {
        return available;
    }

    public void setAvailable(boolean available) {
        this.available = available;
    }
}
