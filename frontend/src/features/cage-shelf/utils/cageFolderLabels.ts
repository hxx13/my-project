import type { FolderTreeManagerLabels } from "@/features/form-shared/FolderTreeManager";

/**
 * 笼位域 FolderTreeManager 文案。
 * 原先寄放在 features/nhp/utils/folderTreeLabels.ts，属于笼位文案写进 NHP 文件的反向污染，已迁回本域。
 */

/** 笼位码表页（扁平文件夹 + 码表） */
export const CAGE_CODELIST_FOLDER_LABELS: FolderTreeManagerLabels = {
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

/** 笼位字段页（域 → 子模块 → 字段） */
export const CAGE_FIELD_FOLDER_LABELS: FolderTreeManagerLabels = {
  createFolder: "＋ 新建数据域",
  createItem: "＋ 新建字段",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  moveItem: "移动",
  emptyFolder: "空数据域",
  emptyFolderAction: "新建字段",
  moveModalTitle: "移动字段到…",
  moveModalHint: "选择目标文件夹",
  folderCreateItemLabel: "新增字段",
  folderCreateFolderLabel: "新建子模块",
};
