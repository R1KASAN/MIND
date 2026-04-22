export interface RetrievalSourceItem {
  id: string;
  roomId?: string;
  kind?: string;
  summary?: string;
  rawText?: string;
  extractedText?: string;
  createdAt?: number;
  originMeta?: Record<string, unknown>;
}

export interface RetrievalHit<TSource extends RetrievalSourceItem = RetrievalSourceItem> {
  item: TSource;
  score: number;
  reason: string;
}

export interface RetrievalEngine<TSource extends RetrievalSourceItem = RetrievalSourceItem> {
  indexSourceItem(item: TSource): Promise<void>;
  deleteSourceItem(id: string): Promise<void>;
  retrieve(query: string, roomId: string, k: number): Promise<TSource[]>;
}

export interface RetrievalActivationInput {
  sourceItemCount: number;
  roomAgeMs: number;
  notLikeThisRate?: number;
}

export const RETRIEVAL_COMPLEXITY_DEFAULTS = {
  sourceItemThreshold: 30,
  roomAgeMsThreshold: 1000 * 60 * 60 * 24 * 90,
  notLikeThisRateThreshold: 0.35,
};

export function shouldUseRicherRetrieval(
  input: RetrievalActivationInput,
  config = RETRIEVAL_COMPLEXITY_DEFAULTS,
) {
  return (
    input.sourceItemCount > config.sourceItemThreshold ||
    input.roomAgeMs > config.roomAgeMsThreshold ||
    (typeof input.notLikeThisRate === 'number' && input.notLikeThisRate > config.notLikeThisRateThreshold)
  );
}

export class MetadataOnlyRetrievalEngine<TSource extends RetrievalSourceItem = RetrievalSourceItem>
  implements RetrievalEngine<TSource> {
  private readonly items = new Map<string, TSource>();

  async indexSourceItem(item: TSource) {
    this.items.set(item.id, item);
  }

  async deleteSourceItem(id: string) {
    this.items.delete(id);
  }

  async retrieve(query: string, roomId: string, k: number) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return [...this.items.values()]
      .filter((item) => item.roomId === roomId)
      .map((item) => {
        const haystack = [
          item.summary,
          item.rawText,
          item.extractedText,
          item.kind,
          JSON.stringify(item.originMeta ?? {}),
        ].join(' ').toLowerCase();
        const lexicalScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
        const recencyScore = typeof item.createdAt === 'number' ? Math.min(1, item.createdAt / Date.now()) : 0;
        return { item, score: lexicalScore + recencyScore * 0.1 };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(0, k))
      .map((hit) => hit.item);
  }
}

