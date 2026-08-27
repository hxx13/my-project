import type { FolderTreeManagerLabels } from "@/features/form-shared/FolderTreeManager";

/** 码表页 FolderTreeManager 文案（与字段页菜单结构/顺序一致） */
export const CODELIST_FOLDER_LABELS: FolderTreeManagerLabels = {
  createFolder: "＋ 新建文件夹",
  createItem: "＋ 新建码表",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  moveItem: "移动",
  emptyFolder: "空文件夹",
  emptyFolderAction: "新建码表",
  moveModalTitle: "移动码表到…",
  moveModalHint: "选择目标文件夹",
  folderCreateItemLabel: "新增码表",
  folderCreateFolderLabel: "新建子文件夹",
};

/** 字段页（域→子模块→字段）FolderTreeManager 文案 */
export const FIELD_FOLDER_LABELS: FolderTreeManagerLabels = {
  createFolder: "＋ 新建数据域",
  createItem: "＋ 新建字段",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  emptyFolder: "尚无子模块",
  emptyFolderAction: "新建子模块",
  folderCreateItemLabel: "新增字段",
  folderCreateFolderLabel: "新建子模块",
};

/** 表单页（表单文件夹 → 已发布表单）FolderTreeManager 文案 */
export const FORM_FOLDER_LABELS: FolderTreeManagerLabels = {
  createFolder: "＋ 新建文件夹",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  moveItem: "移动",
  emptyFolder: "空文件夹",
  emptyFolderAction: "新建文件夹",
  moveModalTitle: "移动到文件夹",
  moveModalHint: "选择目标文件夹",
  folderCreateFolderLabel: "新建子文件夹",
};
