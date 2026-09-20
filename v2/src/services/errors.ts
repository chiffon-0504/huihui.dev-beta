export type ServiceErrorKind =
  | "configuration"
  | "network"
  | "timeout"
  | "aborted"
  | "http"
  | "invalid_json"
  | "invalid_data";

const messages: Record<ServiceErrorKind, string> = {
  configuration: "Invalid service request configuration.",
  network: "The service request could not be completed.",
  timeout: "The service request timed out.",
  aborted: "The service request was cancelled.",
  http: "The service returned an unsuccessful HTTP response.",
  invalid_json: "The service response was not valid JSON.",
  invalid_data: "The service response did not match the expected data contract.",
};

// Deliberately exclude raw URLs, response bodies, headers and abort reasons.
export class ServiceError extends Error {
  readonly kind: ServiceErrorKind;
  readonly status: number | undefined;

  constructor(kind: ServiceErrorKind, status?: number) {
    super(messages[kind]);
    this.name = "ServiceError";
    this.kind = kind;
    this.status = status;
  }
}
