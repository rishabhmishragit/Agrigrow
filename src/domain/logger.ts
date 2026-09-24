export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  event: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

const SECRET_KEY = /password|otp|secret|api[_-]?key|authorization|token/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(inner);
    }
    return output;
  }
  return value;
}

const buffer: LogEntry[] = [];

export function logEvent(
  level: LogLevel,
  event: string,
  details?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    details: details ? (redact(details) as Record<string, unknown>) : undefined,
  };
  buffer.push(entry);
  if (buffer.length > 200) buffer.shift();
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function recentLogs(): LogEntry[] {
  return [...buffer];
}
