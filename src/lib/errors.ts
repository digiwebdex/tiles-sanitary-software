import { supabase } from "@/integrations/supabase/client";

const IS_PRODUCTION = import.meta.env.PROD;

// ---------- Application error class ----------

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  /** User-safe message (never contains internals) */
  public readonly userMessage: string;

  constructor(
    message: string,
    code = "UNKNOWN_ERROR",
    statusCode = 500,
    userMessage?: string
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage =
      userMessage ?? (statusCode < 500 ? message : "Something went wrong. Please try again.");
  }

  static validation(message: string) {
    return new AppError(message, "VALIDATION_ERROR", 400, message);
  }

  static notFound(entity: string) {
    return new AppError(
      `${entity} not found`,
      "NOT_FOUND",
      404,
      `${entity} not found`
    );
  }

  static database(message: string) {
    return new AppError(
      `Database error: ${message}`,
      "DB_ERROR",
      500,
      "A database error occurred. Please try again."
    );
  }

  static insufficientStock(product?: string) {
    const msg = `Insufficient stock${product ? ` for ${product}` : ""}`;
    return new AppError(msg, "INSUFFICIENT_STOCK", 400, msg);
  }
}

// ---------- Centralised error handler ----------

/**
 * Centralised error handler.
 * - Logs full details internally (console in dev, audit_logs in prod).
 * - Returns a safe, generic message string for display to the user.
 */
export async function handleError(
  error: unknown,
  context?: { dealerId?: string; userId?: string; action?: string }
): Promise<string> {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(
          error instanceof Error ? error.message : String(error),
          "UNHANDLED_ERROR",
          500
        );

  // Always log full details internally
  if (IS_PRODUCTION) {
    // Silently log to audit_logs (fire-and-forget)
    try {
      await supabase.from("audit_logs").insert([
        {
          dealer_id: context?.dealerId ?? null,
          user_id: context?.userId ?? null,
          action: context?.action ?? "ERROR",
          table_name: "app_errors",
          record_id: appError.code,
          new_data: {
            message: appError.message,
            code: appError.code,
            statusCode: appError.statusCode,
          } as any,
        },
      ]);
    } catch {
      // Swallow — never let error logging crash the app
    }
  } else {
    // In development, log full stack for debugging
    console.error("[AppError]", appError.code, appError.message, appError.stack);
  }

  return appError.userMessage;
}

/**
 * Convenience wrapper: call an async function and return
 * `{ data, error }` where `error` is a user-safe string.
 */
export async function trySafe<T>(
  fn: () => Promise<T>,
  context?: { dealerId?: string; userId?: string; action?: string }
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    const message = await handleError(err, context);
    return { data: null, error: message };
  }
}

// ---------- Supabase result unwrapper ----------

/** Wraps a Supabase query result, throwing AppError on failure */
export function unwrapSupabase<T>(
  result: { data: T | null; error: { message: string } | null },
  entityName = "Record"
): T {
  if (result.error) throw AppError.database(result.error.message);
  if (result.data === null) throw AppError.notFound(entityName);
  return result.data;
}
