/** 笼位域唯一已发布表单（MVP：字段来自 cage_info_field，无独立 template 表） */
export const CAGE_FORM_KEY = "cage_detail";
export const CAGE_FORM_TITLE = "笼位详情表单";
export const CAGE_FORM_DESCRIPTION =
  "笼架认领与详情展示表单；字段字典存于 cage_info_field，码表存于 cage_info_codelist。";

export function cageFormEditPath(formKey: string = CAGE_FORM_KEY): string {
  return `/admin/cage-shelves/forms/edit/${encodeURIComponent(formKey)}`;
}
