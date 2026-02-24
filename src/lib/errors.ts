export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

export function success<T>(data: T): ActionResult<T> {
  return { success: true, data }
}

export function failure(error: string, code?: string): ActionResult<never> {
  return { success: false, error, code }
}

export class AppError extends Error {
  code: string
  statusCode: number

  constructor(
    message: string,
    code: string = 'UNKNOWN',
    statusCode: number = 500,
  ) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado') {
    super(message, 'UNAUTHORIZED', 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Sin permisos') {
    super(message, 'FORBIDDEN', 403)
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(
      `${entity} no encontrado${id ? `: ${id}` : ''}`,
      'NOT_FOUND',
      404,
    )
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION', 400)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409)
  }
}
