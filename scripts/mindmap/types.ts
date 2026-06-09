// ============================================================
// TwinSystem Mindmap — TypeScript Type Definitions
// Maps 1:1 to mindmap.yaml schema
// ============================================================

// ---- Meta ----
export interface MindmapMeta {
  version: string;
  generated: string;       // ISO 8601 timestamp
  project: string;
  scanner_version: string;
}

// ---- API Endpoint ----
export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  full_path: string;
  summary: string;          // auto from swagger @Operation or manual
  params: ApiParam[];
  returns: string;          // manual: return type description
}

export interface ApiParam {
  name: string;
  in: 'query' | 'path' | 'body' | 'header';
  type: string;
  required: boolean;
  description: string;
}

// ---- Controller ----
export interface ControllerInfo {
  class: string;
  base_path: string;
  apis: ApiEndpoint[];
}

// ---- Service ----
export interface ServiceInfo {
  class: string;
  dependencies: string[];   // injected dependency class names
  methods: ServiceMethod[];
}

export interface ServiceMethod {
  name: string;
  summary: string;          // manual
}

// ---- Data Entity ----
export interface DataEntity {
  name: string;
  table: string;
  key_fields: string[];
  description: string;      // manual
}

// ---- Scheduled Task ----
export interface ScheduledTask {
  method: string;
  cron: string;
  description: string;      // manual
}

// ---- Module (backend) ----
export interface ModuleInfo {
  package: string;
  role: string;             // 'controller' | 'service' | 'repository' | 'config' | 'domain'
  controllers: ControllerInfo[];
  services: ServiceInfo[];
  mappers: string[];        // MyBatis Mapper interface names
  entities: DataEntity[];
  scheduled_tasks: ScheduledTask[];
}

// ---- Frontend ----
export interface FrontendPage {
  route: string;
  component: string;
  api_calls: string[];      // "GET /api/xxx" format
  stores: string[];         // Zustand store names
}

// ---- Interaction ----
export interface Interaction {
  target: string;           // target domain id
  type: 'rest-call' | 'event-publish' | 'event-subscribe' | 'rpc' | 'db-shared';
  detail: string;           // manual: description of the interaction
  source: 'auto' | 'manual';
}

// ---- Data Flow (manual) ----
export interface DataFlow {
  name: string;
  trigger: string;
  steps: string[];
}

// ---- Domain (business domain) ----
export interface Domain {
  id: string;               // kebab-case, matches package directory
  name: string;             // manual: Chinese name
  summary: string;          // manual: one-line description
  description: string;      // manual: detailed description
  business_actors: string[];// manual: who uses this domain
  business_rules: string[]; // manual: key business rules
  modules: ModuleInfo[];    // auto + manual adjust
  frontend: FrontendPage[]; // auto + manual adjust
  interactions: Interaction[]; // auto + manual
  data_flows: DataFlow[];   // manual
  pending: string[];        // manual: items to investigate
}

// ---- Cross-cutting Concern ----
export interface CrossCuttingConcern {
  name: string;
  description: string;
  involved_modules: string[];
  flow: string;             // markdown description of the flow
  notes: string;
}

// ---- Global Annotations ----
export interface GlobalAnnotations {
  architecture_notes: string;
  tech_debt: string[];
  glossary: GlossaryEntry[];
}

export interface GlossaryEntry {
  term: string;
  meaning: string;
}

// ---- Root Document ----
export interface MindmapDocument {
  meta: MindmapMeta;
  domains: Domain[];
  cross_cutting: CrossCuttingConcern[];
  annotations: GlobalAnnotations;
}

// ---- Scanner raw results (internal, not in YAML) ----
export interface ScanResult {
  domains: Domain[];        // auto-scanned domains (only auto fields populated)
  warnings: string[];       // things the scanner couldn't resolve
}
