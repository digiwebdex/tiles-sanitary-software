export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = "UNKNOWN_ERROR", statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }

  static validation(message: string) {
    return new AppError(message, "VALIDATION_ERROR", 400);
  }

  static notFound(entity: string) {
    return new AppError(`${entity} not found`, "NOT_FOUND", 404);
  }

  static database(message: string) {
    return new AppError(`Database error: ${message}`, "DB_ERROR", 500);
  }

  static insufficientStock(product?: string) {
    return new AppError(
      `Insufficient stock${product ? ` for ${product}` : ""}`,
      "INSUFFICIENT_STOCK",
      400
    );
  }
}

/** Wraps a Supabase query result, throwing AppError on failure */
export function unwrapSupabase<T>(
  result: { data: T | null; error: { message: string } | null },
  entityName = "Record"
): T {
  if (result.error) throw AppError.database(result.error.message);
  if (result.data === null) throw AppError.notFound(entityName);
  return result.data;
}
