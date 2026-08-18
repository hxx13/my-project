package com.example.demo.modules.admin.model;

import java.util.ArrayList;
import java.util.List;

public class AdminNavConfigNode {
    private String id;
    private String parentId;
    private String type;
    private String scope;
    private String title;
    private String itemPath;
    private String itemIcon;
    private String itemBadgeKey;
    private int sortOrder;
    private boolean visible;
    private List<AdminNavConfigNode> children = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getItemPath() { return itemPath; }
    public void setItemPath(String itemPath) { this.itemPath = itemPath; }
    public String getItemIcon() { return itemIcon; }
    public void setItemIcon(String itemIcon) { this.itemIcon = itemIcon; }
    public String getItemBadgeKey() { return itemBadgeKey; }
    public void setItemBadgeKey(String itemBadgeKey) { this.itemBadgeKey = itemBadgeKey; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isVisible() { return visible; }
    public void setVisible(boolean visible) { this.visible = visible; }
    public List<AdminNavConfigNode> getChildren() { return children; }
    public void setChildren(List<AdminNavConfigNode> children) { this.children = children; }
}
