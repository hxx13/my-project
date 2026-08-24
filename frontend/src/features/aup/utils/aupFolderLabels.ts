import type { FolderTreeManagerLabels } from "@/features/form-shared/FolderTreeManager";

/**
 * AUP 配置面 FolderTreeManager 文案。
 * 与 NHP/笼位共用同一套共享组件，但文案必须落在本 feature，不得 import 下游 nhp/cage。
 */

/** 码表页（扁平/多级文件夹 + 码表） */
export const AUP_DICT_FOLDER_LABELS: FolderTreeManagerLabels = {
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

/** 字段域页（多级文件夹 + 字段） */
export const AUP_FIELD_FOLDER_LABELS: FolderTreeManagerLabels = {
  createFolder: "＋ 新建文件夹",
  createItem: "＋ 新建字段",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  moveItem: "移动",
  emptyFolder: "空文件夹",
  emptyFolderAction: "新建字段",
  moveModalTitle: "移动字段到…",
  moveModalHint: "选择目标文件夹",
  folderCreateItemLabel: "新增字段",
  folderCreateFolderLabel: "新建子文件夹",
};

/** 原子域文件夹（ownerType=ATOM） */
export const AUP_ATOM_FOLDER_LABELS: FolderTreeManagerLabels = {
  createFolder: "＋ 新建文件夹",
  createItem: "＋ 新建原子域",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  moveItem: "移动",
  emptyFolder: "空文件夹",
  emptyFolderAction: "新建原子域",
  moveModalTitle: "移动原子域到…",
  moveModalHint: "选择目标文件夹",
  folderCreateItemLabel: "新增原子域",
  folderCreateFolderLabel: "新建子文件夹",
};
