export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("Authentication is required.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";

  constructor() {
    super("You are not authorized to perform this operation.");
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  readonly code = "CONFLICT";

  constructor(message = "The requested record already exists.") {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("The requested record was not found.");
    this.name = "NotFoundError";
  }
}
