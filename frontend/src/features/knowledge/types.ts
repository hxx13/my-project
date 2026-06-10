export interface KnowledgeCategory {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  sortOrder: number;
  icon: string;
  description?: string;
}

export interface KnowledgeTreeNode {
  categoryId: number;
  parentId: number | null;
  categoryName: string;
  categorySlug: string;
  icon: string;
  sortOrder: number;
  pages: KnowledgePageSummary[];
  children: KnowledgeTreeNode[];
}

export interface KnowledgePageSummary {
  id: number;
  slug: string;
  title: string;
  source: string;
  version: number;
}

export interface KnowledgePage {
  id: number;
  categoryId: number;
  slug: string;
  title: string;
  contentHtml: string;
  contentMd?: string;
  source: 'imported' | 'agent' | 'manual';
  version: number;
  author: string;
  isPublished: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeHistory {
  id: number;
  pageId: number;
  version: number;
  author: string;
  summary?: string;
  createdAt: string;
}

// ── Shell State ──
export type ShellView = 'browse' | 'graph' | 'timeline';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: number;
  title: string;
  categoryId: number;
  categoryName: string;
  refCount: number;
}

export interface GraphEdge {
  source: number;
  target: number;
  type: 'manual' | 'auto';
}

export interface TimelineEvent {
  id: number;
  pageId: number;
  pageTitle: string;
  categoryName: string;
  type: 'created' | 'edited' | 'imported' | 'rollback';
  author: string;
  summary: string | null;
  createdAt: string;
}

export interface TagStats {
  name: string;
  count: number;
}

export interface KnowledgeStats {
  totalPages: number;
  totalCategories: number;
  totalTags: number;
  lastUpdated: string | null;
}
