/**
 * Sourcing API DTOs — request/response shapes (expanded from Sprint 2).
 */

export interface SourcingHealthResponse {
  status: 'ok';
  module: 'sourcing';
  version: string;
  tenantScoped: true;
}
