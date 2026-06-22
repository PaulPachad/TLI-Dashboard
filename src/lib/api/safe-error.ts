import { NextResponse } from "next/server";

const INTERNAL_ERROR_PATTERNS = [
  /Invalid `?prisma\./i,
  /PrismaClient/i,
  /\bP\d{4}\b/,
  /column .* does not exist/i,
  /no such column/i,
  /relation .* does not exist/i,
  /database/i,
  /\bSQL\b/i,
  /constraint failed/i,
  /foreign key/i,
];

const NETWORK_ERROR_PATTERNS = [
  /fetch failed/i,
  /network/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /socket hang up/i,
];

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  if (typeof error === "string") return error;
  return "";
}

export function getErrorStatus(error: unknown, fallbackStatus = 500): number {
  if (typeof error !== "object" || !error) return fallbackStatus;
  const status = (error as { status?: unknown }).status;
  if (typeof status !== "number") return fallbackStatus;
  if (status < 400 || status > 599) return fallbackStatus;
  return status;
}

export function isInternalErrorMessage(message: string): boolean {
  return INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function toUserSafeErrorMessage(
  error: unknown,
  fallbackMessage: string,
  options: {
    allowClientMessage?: boolean;
    networkMessage?: string;
  } = {}
): string {
  const message = getErrorMessage(error).trim();
  if (!message) return fallbackMessage;

  if (isInternalErrorMessage(message)) return fallbackMessage;

  if (NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return (
      options.networkMessage ||
      "We could not reach the service right now. Please check access and try again."
    );
  }

  return options.allowClientMessage ? message : fallbackMessage;
}

export function safeApiErrorResponse(
  error: unknown,
  {
    fallbackMessage,
    fallbackStatus = 500,
    logPrefix,
  }: {
    fallbackMessage: string;
    fallbackStatus?: number;
    logPrefix: string;
  }
) {
  const status = getErrorStatus(error, fallbackStatus);
  const allowClientMessage = status >= 400 && status < 500;
  const message = toUserSafeErrorMessage(error, fallbackMessage, {
    allowClientMessage,
  });

  if (status >= 500) {
    console.error(logPrefix, error);
  }

  return NextResponse.json({ error: message }, { status });
}
