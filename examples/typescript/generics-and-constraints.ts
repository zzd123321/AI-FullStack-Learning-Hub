interface Entity {
  readonly id: string;
}

interface Lesson extends Entity {
  readonly title: string;
  readonly durationMinutes: number;
  readonly published: boolean;
}

interface LessonSummary extends Entity {
  readonly label: string;
  readonly available: boolean;
}

/** Item 把分页容器与它内部的元素类型关联起来。 */
interface Page<Item> {
  readonly items: readonly Item[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

interface ApiError {
  readonly code: string;
  readonly message: string;
}

/** 大多数接口使用 ApiError，少数接口可以覆盖 ErrorData。 */
type ApiResult<Data, ErrorData = ApiError> =
  | { ok: true; data: Data }
  | { ok: false; error: ErrorData };

type NonEmptyArray<Item> = readonly [Item, ...Item[]];

/** 普通数组可能为空，因此返回值必须保留 undefined。 */
function first<Item>(items: readonly Item[]): Item | undefined {
  return items[0];
}

/** 非空条件已经写进参数类型，所以首项一定存在。 */
function firstRequired<Item>(items: NonEmptyArray<Item>): Item {
  return items[0];
}

/**
 * Input 从 source.items 推断，Output 从 transform 的返回值推断。
 * 分页信息保持不变，元素类型从 Page<Input> 变成 Page<Output>。
 */
function mapPage<Input, Output>(
  source: Page<Input>,
  transform: (item: Input, index: number) => Output,
): Page<Output> {
  return {
    ...source,
    items: source.items.map(transform),
  };
}

/**
 * 仓库实现确实需要 item.id，因此使用 Entity 作为最低约束。
 * Item 仍保留 Lesson 等具体类型的其他字段。
 */
class MemoryRepository<Item extends Entity> {
  private readonly records = new Map<string, Item>();

  constructor(initialItems: readonly Item[] = []) {
    for (const item of initialItems) this.save(item);
  }

  save(item: Item): Item {
    this.records.set(item.id, item);
    return item;
  }

  findAll(): readonly Item[] {
    return [...this.records.values()];
  }
}

function toSuccess<Data>(data: Data): ApiResult<Data> {
  return { ok: true, data };
}

const initialLessons: NonEmptyArray<Lesson> = [
  {
    id: 'ts-03',
    title: '联合类型、交叉类型与类型收窄',
    durationMinutes: 120,
    published: true,
  },
  {
    id: 'ts-04',
    title: 'TypeScript 泛型基础与约束',
    durationMinutes: 120,
    published: false,
  },
];

const repository = new MemoryRepository(initialLessons);

const lessonPage: Page<Lesson> = {
  items: repository.findAll(),
  page: 1,
  pageSize: 20,
  total: repository.findAll().length,
};

const summaryPage = mapPage(lessonPage, (lesson) => ({
  id: lesson.id,
  label: `${lesson.title}（${lesson.durationMinutes} 分钟）`,
  available: lesson.published,
}));

const response: ApiResult<Page<LessonSummary>> = toSuccess(summaryPage);
const optionalFirstTitle = first(lessonPage.items)?.title ?? '暂无课程';
const requiredFirstTitle = firstRequired(initialLessons).title;

if (response.ok) {
  console.log('分页摘要：', response.data.items);
}

console.log('普通数组首项：', optionalFirstTitle);
console.log('非空数组首项：', requiredFirstTitle);
