export interface ReferenceFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "email" | "image" | "tel";
  required: boolean;
  showInCard: boolean;
  searchable: boolean;
  placeholder?: string;
}

export interface ReferenceTypeConfig {
  typeKey: string;
  label: string;
  icon: string;
  parentType?: string;
  childType?: string;
  childLabel?: string;
  hasPurchasable: boolean;
  fields: ReferenceFieldDef[];
}

export const REFERENCE_TYPE_REGISTRY: Record<string, ReferenceTypeConfig> = {
  SUPPLIER: {
    typeKey: "SUPPLIER",
    label: "供应商",
    icon: "",
    childType: "ANIMAL_BREED",
    childLabel: "查看品种",
    hasPurchasable: false,
    fields: [
      { key: "title", label: "主标题", type: "text", required: true, showInCard: true, searchable: true, placeholder: "如: 上海灵畅生物科技有限公司" },
      { key: "subtitle", label: "副标题", type: "text", required: false, showInCard: true, searchable: true, placeholder: "如: 灵畅" },
      { key: "address", label: "地址", type: "text", required: false, showInCard: false, searchable: false, placeholder: "详细地址" },
      { key: "phone", label: "电话", type: "tel", required: false, showInCard: false, searchable: false, placeholder: "联系电话" },
      { key: "email", label: "邮箱", type: "email", required: false, showInCard: false, searchable: false, placeholder: "电子邮箱" },
      { key: "imageUrl", label: "图片", type: "image", required: false, showInCard: false, searchable: false },
    ],
  },
  ANIMAL_BREED: {
    typeKey: "ANIMAL_BREED",
    label: "品种",
    icon: "",
    parentType: "SUPPLIER",
    childType: "ANIMAL_STRAIN",
    childLabel: "查看品系",
    hasPurchasable: false,
    fields: [
      { key: "title", label: "主标题", type: "text", required: true, showInCard: true, searchable: true, placeholder: "如: 实验小鼠" },
      { key: "subtitle", label: "副标题", type: "text", required: false, showInCard: true, searchable: true, placeholder: "如: Mus musculus" },
      { key: "description", label: "描述", type: "textarea", required: false, showInCard: false, searchable: false, placeholder: "品种描述..." },
      { key: "imageUrl", label: "图片", type: "image", required: false, showInCard: false, searchable: false },
    ],
  },
  ANIMAL_STRAIN: {
    typeKey: "ANIMAL_STRAIN",
    label: "品系",
    icon: "",
    parentType: "ANIMAL_BREED",
    childType: "GENOTYPE",
    childLabel: "查看规格",
    hasPurchasable: true,
    fields: [
      { key: "title", label: "主标题", type: "text", required: true, showInCard: true, searchable: true, placeholder: "如: C57BL/6" },
      { key: "subtitle", label: "副标题", type: "text", required: false, showInCard: true, searchable: true, placeholder: "如: C57BL/6J" },
      { key: "description", label: "描述", type: "textarea", required: false, showInCard: false, searchable: false, placeholder: "品系描述..." },
      { key: "imageUrl", label: "图片", type: "image", required: false, showInCard: false, searchable: false },
    ],
  },
  GENOTYPE: {
    typeKey: "GENOTYPE",
    label: "规格",
    icon: "",
    parentType: "ANIMAL_STRAIN",
    hasPurchasable: true,
    fields: [
      { key: "title", label: "主标题", type: "text", required: true, showInCard: true, searchable: true, placeholder: "如: Wild Type" },
      { key: "subtitle", label: "副标题", type: "text", required: false, showInCard: true, searchable: true, placeholder: "如: WT" },
      { key: "description", label: "描述", type: "textarea", required: false, showInCard: false, searchable: false, placeholder: "规格描述..." },
      { key: "imageUrl", label: "图片", type: "image", required: false, showInCard: false, searchable: false },
    ],
  },
};

export function getTypeConfig(typeKey: string): ReferenceTypeConfig | undefined {
  return REFERENCE_TYPE_REGISTRY[typeKey];
}

export function getAllTypeConfigs(): ReferenceTypeConfig[] {
  return Object.values(REFERENCE_TYPE_REGISTRY);
}

export function getChildTypes(parentTypeKey: string): ReferenceTypeConfig[] {
  return getAllTypeConfigs().filter((t) => t.parentType === parentTypeKey);
}

/** Hierarchy from root to leaf */
export const TYPE_HIERARCHY_ORDER = ["SUPPLIER", "ANIMAL_BREED", "ANIMAL_STRAIN", "GENOTYPE"];

/**
 * Check if a card can use a template.
 * Scope value is either "ALL" (global) or "ref:<itemId>" (scoped to a specific data item).
 * When scoped to an item, the card must be a descendant of that item.
 * `drillItemIds`: IDs of ancestor items in the drill chain (excluding current card).
 */
export function isTemplateAvailableForCard(
  scope: string | undefined | null,
  drillItemIds: number[],
): boolean {
  if (!scope || scope === "ALL") return true;
  if (scope.startsWith("ref:")) {
    const scopeId = Number(scope.slice(4));
    if (!Number.isFinite(scopeId)) return true;
    return drillItemIds.includes(scopeId);
  }
  // Legacy: match by type key
  return true;
}
