import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

/** `{ data, meta }` success envelope — `meta` is only present when supplied (list endpoints). */
export function sendData<T>(res: Response, data: T, meta?: PaginationMeta, status = 200): void {
  res.status(status).json(meta ? { data, meta } : { data });
}

export function sendCreated<T>(res: Response, data: T): void {
  sendData(res, data, undefined, 201);
}
