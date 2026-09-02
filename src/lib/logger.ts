export type SafeLogContext = Readonly<{
  requestId?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
  errorCode?: string;
  event?: string;
}>;

type LogLevel = "info" | "warn" | "error";

function writeLog(level: LogLevel, message: string, context: SafeLogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const serializedEntry = JSON.stringify(entry);

  if (level === "error") {
    console.error(serializedEntry);
    return;
  }

  if (level === "warn") {
    console.warn(serializedEntry);
    return;
  }

  console.info(serializedEntry);
}

export function logInfo(message: string, context: SafeLogContext = {}): void {
  writeLog("info", message, context);
}

export function logWarning(message: string, context: SafeLogContext = {}): void {
  writeLog("warn", message, context);
}

export function logError(message: string, context: SafeLogContext = {}): void {
  writeLog("error", message, context);
}
