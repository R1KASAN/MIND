import MiniSearch, { type SearchResult } from 'minisearch';

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

interface IndexedRetrievalDocument {
  id: string;
  roomId: string;
  kind: string;
  summary: string;
  rawText: string;
  extractedText: string;
  originMeta: string;
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

function normalizeToken(token: string) {
  return token.toLocaleLowerCase().trim();
}

function thaiNgrams(value: string) {
  const compact = value.replace(/\s+/g, '');
  const grams: string[] = compact ? [compact] : [];
  for (let index = 0; index < compact.length; index += 1) {
    for (const size of [2, 3, 4]) {
      const gram = compact.slice(index, index + size);
      if (gram.length === size) grams.push(gram);
    }
  }
  return grams;
}

function segmentThaiText(value: string) {
  const segmenterCtor = (Intl as typeof Intl & {
    Segmenter?: new (locale: string, options: { granularity: 'word' }) => {
      segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }>;
    };
  }).Segmenter;

  if (!segmenterCtor) return thaiNgrams(value);

  const segmenter = new segmenterCtor('th', { granularity: 'word' });
  const segments = [...segmenter.segment(value)]
    .filter((segment) => segment.isWordLike !== false)
    .map((segment) => normalizeToken(segment.segment))
    .filter(Boolean);

  return [...segments, ...thaiNgrams(value)];
}

export function tokenizeRoomMemoryText(text: string) {
  const tokens: string[] = [];
  const normalized = text.normalize('NFKC');
  const chunks = normalized.match(/[\u0E00-\u0E7F]+|[A-Za-z0-9_@.-]+/g) ?? [];

  for (const chunk of chunks) {
    if (/[\u0E00-\u0E7F]/.test(chunk)) {
      tokens.push(...segmentThaiText(chunk));
    } else {
      const token = normalizeToken(chunk);
      if (token) tokens.push(token);
    }
  }

  return [...new Set(tokens)];
}

function sourceToDocument(item: RetrievalSourceItem): IndexedRetrievalDocument {
  return {
    id: item.id,
    roomId: item.roomId ?? '',
    kind: item.kind ?? '',
    summary: item.summary ?? '',
    rawText: item.rawText ?? '',
    extractedText: item.extractedText ?? '',
    originMeta: JSON.stringify(item.originMeta ?? {}),
  };
}

function recencyBoost(createdAt?: number) {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return 0;
  const ageDays = Math.max(0, (Date.now() - createdAt) / 86400000);
  return 0.2 / (1 + ageDays);
}

function describeMatch(result: SearchResult) {
  const fields = [...new Set(Object.values(result.match ?? {}).flat())];
  const terms = result.terms.slice(0, 4).join(', ');
  if (fields.length === 0 && !terms) return 'lexical_match';
  return `lexical_match:${fields.join(',') || 'field'}:${terms || 'term'}`;
}

export class MiniSearchRetrievalEngine<TSource extends RetrievalSourceItem = RetrievalSourceItem>
  implements RetrievalEngine<TSource> {
  private readonly items = new Map<string, TSource>();
  private readonly index = new MiniSearch<IndexedRetrievalDocument>({
    idField: 'id',
    fields: ['kind', 'summary', 'rawText', 'extractedText', 'originMeta'],
    storeFields: ['roomId'],
    tokenize: tokenizeRoomMemoryText,
    searchOptions: {
      boost: {
        summary: 3,
        extractedText: 2,
        rawText: 1.5,
        kind: 0.5,
        originMeta: 0.25,
      },
      prefix: true,
      fuzzy: 0.18,
    },
  });

  async indexSourceItem(item: TSource) {
    const hadItem = this.items.has(item.id);
    const normalizedItem = item.roomId ? item : ({ ...item, roomId: item.id } as TSource);
    this.items.set(item.id, normalizedItem);
    if (hadItem) {
      this.index.replace(sourceToDocument(normalizedItem));
    } else {
      this.index.add(sourceToDocument(normalizedItem));
    }
  }

  async deleteSourceItem(id: string) {
    this.items.delete(id);
    this.index.discard(id);
  }

  async retrieveHits(query: string, roomId: string, k: number): Promise<RetrievalHit<TSource>[]> {
    const limit = Math.max(0, k);
    if (limit === 0) return [];

    const normalizedQuery = query.trim();
    const roomScopedItems = [...this.items.values()].filter((item) => item.roomId === roomId);
    if (!normalizedQuery) {
      return roomScopedItems
        .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
        .slice(0, limit)
        .map((item) => ({
          item,
          score: recencyBoost(item.createdAt),
          reason: 'recent_room_memory',
        }));
    }

    return this.index.search(normalizedQuery, {
      filter: (result) => result.roomId === roomId,
    })
      .map((result) => {
        const item = this.items.get(String(result.id));
        if (!item) return null;
        return {
          item,
          score: result.score + recencyBoost(item.createdAt),
          reason: describeMatch(result),
        };
      })
      .filter((hit): hit is RetrievalHit<TSource> => Boolean(hit))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async retrieve(query: string, roomId: string, k: number) {
    const hits = await this.retrieveHits(query, roomId, k);
    return hits.map((hit) => hit.item);
  }
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
