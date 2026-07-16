export type SearchSort = 'relevance' | 'newest' | 'oldest' | 'title';

export interface SearchQuery {
  readonly term: string;
  readonly categories: readonly string[];
  readonly status: 'all' | 'published' | 'draft';
  readonly sort: SearchSort;
  readonly cursor?: string;
}

const SORTS: ReadonlySet<string> = new Set(['relevance', 'newest', 'oldest', 'title']);
const STATUSES: ReadonlySet<string> = new Set(['all', 'published', 'draft']);
const SAFE_VALUE = /^[a-zA-Z0-9_-]{1,80}$/;

export function parseSearchQuery(params: URLSearchParams): SearchQuery {
  const rawSort = params.get('sort') ?? 'relevance';
  const rawStatus = params.get('status') ?? 'all';
  const rawCursor = params.get('cursor');
  const categories = [...new Set(params.getAll('category').filter((value) => SAFE_VALUE.test(value)))]
    .sort().slice(0, 20);
  return {
    term: (params.get('q') ?? '').trim().slice(0, 200),
    categories,
    status: STATUSES.has(rawStatus) ? rawStatus as SearchQuery['status'] : 'all',
    sort: SORTS.has(rawSort) ? rawSort as SearchSort : 'relevance',
    ...(rawCursor && /^[a-zA-Z0-9_-]{1,500}$/.test(rawCursor) ? { cursor: rawCursor } : {}),
  };
}

export function encodeSearchQuery(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  const term = query.term.trim().slice(0, 200);
  if (term) params.set('q', term);
  [...new Set(query.categories.filter((value) => SAFE_VALUE.test(value)))]
    .sort().slice(0, 20).forEach((value) => params.append('category', value));
  if (query.status !== 'all') params.set('status', query.status);
  if (query.sort !== 'relevance') params.set('sort', query.sort);
  if (query.cursor && /^[a-zA-Z0-9_-]{1,500}$/.test(query.cursor)) {
    params.set('cursor', query.cursor);
  }
  return params;
}

export function changeCriteria(query: SearchQuery, patch: Partial<SearchQuery>): SearchQuery {
  const { cursor: _discarded, ...withoutCursor } = { ...query, ...patch };
  return withoutCursor;
}
