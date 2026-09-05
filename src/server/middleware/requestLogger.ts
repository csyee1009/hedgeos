import { Request, Response, NextFunction } from "express";

export function redactSensitiveText(text: string): string {
  if (!text) return text;
  return text
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/gi, "$1?[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/(Cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(Authorization\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s,"']+/gi, "$1[REDACTED]")
    .replace(/\b(AIzaSy|sk-)[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\b0x[a-fA-F0-9]{64}\b/g, "[REDACTED_HEX]");
}

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 400 ? "error" : "info",
      requestId: req.requestId || "unknown",
      method: req.method,
      route: req.baseUrl + req.path,
      statusCode: res.statusCode,
      durationMs,
      errorCode: (res as any).locals?.errorCode,
    };

    console.log(redactSensitiveText(JSON.stringify(logEntry)));
  });

  next();
}
