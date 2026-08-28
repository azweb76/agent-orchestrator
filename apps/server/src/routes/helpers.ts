import type express from 'express';

export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function asyncHandler(
  fn: (req: express.Request, res: express.Response) => Promise<void>,
): express.RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}
