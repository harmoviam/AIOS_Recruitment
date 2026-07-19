import { z } from 'zod';

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  q: z.string().trim().max(120).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function parseListQuery(input: unknown): ListQuery {
  return listQuerySchema.parse(input);
}

export function toOffsetLimit(query: ListQuery): { offset: number; limit: number } {
  return {
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  };
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toPageResult<T>(items: T[], total: number, query: ListQuery): PageResult<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}
