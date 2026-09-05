import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const raw = req.headers["x-request-id"];
  let id: string | undefined;

  if (typeof raw === "string" && raw.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(raw)) {
    id = raw;
  } else {
    id = randomUUID();
  }

  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
