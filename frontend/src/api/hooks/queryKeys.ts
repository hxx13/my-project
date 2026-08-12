/**
 * 集中管理所有 TanStack Query key，按业务域分组。
 * 使用 as const 确保类型安全。
 */
export const queryKeys = {
  profile: {
    all: ["profile"] as const,
    detail: () => [...queryKeys.profile.all, "detail"] as const,
  },

  repair: {
    all: ["repair"] as const,
    list: (params: Record<string, unknown>) =>
      ["repair", "list", params] as const,
    detail: (id: string) => ["repair", "detail", id] as const,
    recycle: (params: { page: number; size: number }) =>
      ["repair", "recycle", params] as const,
  },

  purchase: {
    all: ["purchase"] as const,
    list: (params: Record<string, unknown>) =>
      ["purchase", "list", params] as const,
    detail: (id: string) => ["purchase", "detail", id] as const,
    recycle: (params: { page: number; size: number }) =>
      ["purchase", "recycle", params] as const,
  },

  supplies: {
    all: ["supplies"] as const,
    categories: () => ["supplies", "categories"] as const,
    items: (categoryId?: number) =>
      ["supplies", "items", categoryId] as const,
    itemDetail: (itemId: number) => ["supplies", "itemDetail", itemId] as const,
    claims: (params?: Record<string, unknown>) =>
      ["supplies", "claims", params ?? {}] as const,
    claimDetail: (claimId: string) => ["supplies", "claimDetail", claimId] as const,
  },

  cageShelf: {
    all: ["cageShelf"] as const,
    filterOptions: (params?: Record<string, unknown>) =>
      ["cageShelf", "filterOptions", params ?? {}] as const,
    shelfGrid: (shelveId: string) => ["cageShelf", "shelfGrid", shelveId] as const,
  },

  personnel: {
    all: ["personnel"] as const,
    list: (params: Record<string, unknown>) =>
      ["personnel", "list", params] as const,
    detail: (userId: string) => ["personnel", "detail", userId] as const,
  },

  accessRules: {
    all: ["accessRules"] as const,
    list: (params?: Record<string, unknown>) =>
      ["accessRules", "list", params ?? {}] as const,
    detail: (id: string) => ["accessRules", "detail", id] as const,
  },

  dahuaSwing: {
    all: ["dahuaSwing"] as const,
    rules: (params?: Record<string, unknown>) =>
      ["dahuaSwing", "rules", params ?? {}] as const,
    tasks: (params?: Record<string, unknown>) =>
      ["dahuaSwing", "tasks", params ?? {}] as const,
  },

  asset: {
    all: ["asset"] as const,
    list: (params: Record<string, unknown>) =>
      ["asset", "list", params] as const,
    detail: (id: string) => ["asset", "detail", id] as const,
  },

  content: {
    all: ["content"] as const,
    list: (params?: Record<string, unknown>) =>
      ["content", "list", params ?? {}] as const,
    detail: (id: string) => ["content", "detail", id] as const,
  },

  telemetry: {
    all: ["telemetry"] as const,
    archive: (params: Record<string, unknown>) =>
      ["telemetry", "archive", params] as const,
    rolling: (params: Record<string, unknown>) =>
      ["telemetry", "rolling", params] as const,
    watchlists: () => ["telemetry", "watchlists"] as const,
    watchlistDetail: (id: string) => ["telemetry", "watchlistDetail", id] as const,
  },

  notification: {
    all: ["notification"] as const,
    list: (params?: Record<string, unknown>) =>
      ["notification", "list", params ?? {}] as const,
    unreadCount: () => ["notification", "unreadCount"] as const,
  },

  scanner: {
    userStatus: (userId: string) => ["scanner", "userStatus", userId] as const,
    roomCardStatus: () => ["scanner", "roomCardStatus"] as const,
  },

  dashboard: {
    all: ["dashboard"] as const,
    stats: () => ["dashboard", "stats"] as const,
    violationBoard: (params?: Record<string, unknown>) =>
      ["dashboard", "violationBoard", params ?? {}] as const,
  },

  analytics: {
    all: ["analytics"] as const,
    report: (params?: Record<string, unknown>) =>
      ["analytics", "report", params ?? {}] as const,
  },

  auth: {
    all: ["auth"] as const,
    session: () => ["auth", "session"] as const,
    publicPermissions: (platform: string) =>
      ["auth", "publicPermissions", platform] as const,
  },

  pagePermission: {
    all: ["pagePermission"] as const,
    public: (platform: string) => ["pagePermission", "public", platform] as const,
  },

  me: {
    all: ["me"] as const,
    pendingBadges: () => ["me", "pendingBadges"] as const,
  },

  docs: {
    all: ["docs"] as const,
    content: (path: string) => ["docs", "content", path] as const,
  },

  facilityMaintenance: {
    all: ["facilityMaintenance"] as const,
    inspections: (params?: Record<string, unknown>) =>
      ["facilityMaintenance", "inspections", params ?? {}] as const,
  },

  referenceData: {
    all: ["referenceData"] as const,
    list: (typeKey: string, parentId?: number) =>
      ["referenceData", "list", typeKey, parentId ?? "root"] as const,
    detail: (typeKey: string, id: number) =>
      ["referenceData", "detail", typeKey, id] as const,
    options: (typeKey: string) =>
      ["referenceData", "options", typeKey] as const,
    specTemplates: ["referenceData", "specTemplates"] as const,
    cart: ["referenceData", "cart"] as const,
    orders: (params?: Record<string, unknown>) =>
      ["referenceData", "orders", params ?? {}] as const,
    orderDetail: (id: number) =>
      ["referenceData", "orderDetail", id] as const,
    orderLogs: (id: number) =>
      ["referenceData", "orderLogs", id] as const,
  },
} as const;

/** 学生物资申领模块 query keys — 数据隔离于 supplies */
export const materialQueryKeys = {
  all: ["material"] as const,
  categories: () => [...materialQueryKeys.all, "categories"] as const,
  items: (categoryId?: number) => [...materialQueryKeys.all, "items", { categoryId }] as const,
  cart: () => [...materialQueryKeys.all, "cart"] as const,
  requests: () => [...materialQueryKeys.all, "requests"] as const,
  myRequests: (params: Record<string, unknown>) => [...materialQueryKeys.requests(), "mine", params] as const,
  requestDetail: (id: string) => [...materialQueryKeys.requests(), "detail", id] as const,
  myStats: () => [...materialQueryKeys.all, "stats", "mine"] as const,
  adminCategories: () => [...materialQueryKeys.all, "admin", "categories"] as const,
  adminItems: (categoryId?: number) => [...materialQueryKeys.all, "admin", "items", { categoryId }] as const,
  pendingRequests: () => [...materialQueryKeys.requests(), "pending"] as const,
  allRequests: (params: Record<string, unknown>) => [...materialQueryKeys.requests(), "all", params] as const,
  finishedRequests: (params: Record<string, unknown>) => [...materialQueryKeys.requests(), "finished", params] as const,
  statsOverview: (from?: string, to?: string) => [...materialQueryKeys.all, "stats", "overview", { from, to }] as const,
  auditTrail: (params: Record<string, unknown>) => [...materialQueryKeys.all, "stats", "audit", params] as const,
};

/** 门户内容管理模块 query keys */
export const portalContentQueryKeys = {
  all: ["portalContent"] as const,
  publicList: (params: Record<string, unknown>) => [...portalContentQueryKeys.all, "public", "list", params] as const,
  publicDetail: (id: number) => [...portalContentQueryKeys.all, "public", "detail", id] as const,
  categories: (scope?: string) => [...portalContentQueryKeys.all, "categories", { scope }] as const,
  adminList: (params: Record<string, unknown>) => [...portalContentQueryKeys.all, "admin", "list", params] as const,
  adminDetail: (id: number) => [...portalContentQueryKeys.all, "admin", "detail", id] as const,
  recycle: (params: Record<string, unknown>) => [...portalContentQueryKeys.all, "recycle", params] as const,
};
