export type KnowledgeSourceType =
  | "manual"
  | "upload"
  | "wiki"
  | "webpage"
  | "api";

export type KnowledgeDocument = {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  sourceType: KnowledgeSourceType;
  sourceUri?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: string;
  documentId: string;
  tenantId: string;
  content: string;
  index: number;
  tokenEstimate: number;
  title: string;
  sourceType: KnowledgeSourceType;
  sourceUri?: string;
  tags: string[];
};

export type IngestKnowledgeInput = {
  tenantId: string;
  title: string;
  content: string;
  sourceType?: KnowledgeSourceType;
  sourceUri?: string;
  tags?: string[];
};

export type RetrieveKnowledgeInput = {
  tenantId: string;
  query: string;
  limit?: number;
  tags?: string[];
};

export type KnowledgeSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  matchedTerms: string[];
};

export type KnowledgeIngestResult = {
  document: KnowledgeDocument;
  chunks: KnowledgeChunk[];
};

export interface KnowledgeStore {
  saveDocument(result: KnowledgeIngestResult): Promise<void>;
  listDocuments(tenantId: string): Promise<KnowledgeDocument[]>;
  search(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]>;
}
