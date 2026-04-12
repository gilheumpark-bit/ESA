/**
 * ESVA Enterprise SSO + Feature Gating
 * -------------------------------------
 * Multi-tenant enterprise support with SAML/OIDC SSO stubs,
 * custom LLM routing, and feature flag checking.
 *
 * PART 1: Types
 * PART 2: Tenant registry (in-memory stub, production → Supabase)
 * PART 3: SSO validation stubs
 * PART 4: Feature checking
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SSOConfig {
  type: 'saml' | 'oidc';
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  certificate?: string;
  attributeMapping: {
    email: string;
    name?: string;
    role?: string;
    department?: string;
  };
}

export interface EnterpriseTenant {
  id: string;
  name: string;
  domain: string;
  ssoConfig?: SSOConfig;
  customLLM?: string;
  maxUsers: number;
  features: EnterpriseFeature[];
  plan: 'enterprise' | 'enterprise_plus';
  createdAt: string;
  contactEmail: string;
}

export type EnterpriseFeature =
  | 'custom_llm'
  | 'audit_log'
  | 'api_access'
  | 'sso'
  | 'on_premise'
  | 'dedicated_support'
  | 'custom_calculators'
  | 'white_label'
  | 'priority_queue'
  | 'data_residency';

export interface SSOUser {
  email: string;
  name: string;
  tenantId: string;
  role: string;
  department?: string;
  groups?: string[];
  sessionExpiry: string;
}

export interface EnterpriseLimits {
  maxUsers: number;
  maxCalculationsPerDay: number;
  maxStorageGB: number;
  maxApiCallsPerHour: number;
  retentionDays: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Tenant Registry
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * In-memory tenant registry for MVP.
 * Production: migrate to Supabase `enterprise_tenants` table.
 */
const TENANT_REGISTRY = new Map<string, EnterpriseTenant>();

// Domain → tenant ID mapping for SSO domain-based lookup
const DOMAIN_INDEX = new Map<string, string>();

/**
 * Register an enterprise tenant (admin operation).
 */
export function registerTenant(tenant: EnterpriseTenant): void {
  TENANT_REGISTRY.set(tenant.id, tenant);
  DOMAIN_INDEX.set(tenant.domain, tenant.id);
}

/**
 * Get enterprise tenant by ID.
 */
export function getEnterpriseTenantById(id: string): EnterpriseTenant | null {
  return TENANT_REGISTRY.get(id) ?? null;
}

/**
 * Get enterprise tenant by email domain.
 * Used for SSO auto-detection: user@company.com → company.com → tenant
 */
export function getEnterpriseTenant(domain: string): EnterpriseTenant | null {
  const normalized = domain.toLowerCase().trim();
  const tenantId = DOMAIN_INDEX.get(normalized);
  if (!tenantId) return null;
  return TENANT_REGISTRY.get(tenantId) ?? null;
}

/**
 * Get tenant from user email.
 */
export function getTenantFromEmail(email: string): EnterpriseTenant | null {
  const domain = email.split('@')[1];
  if (!domain) return null;
  return getEnterpriseTenant(domain);
}

/**
 * List all registered tenants (admin only).
 */
export function listTenants(): EnterpriseTenant[] {
  return Array.from(TENANT_REGISTRY.values());
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — SSO Validation Stubs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate an SSO token against tenant configuration.
 * STUB: production implementation will use jose/passport.
 *
 * SAML: validate assertion XML against tenant certificate
 * OIDC: validate JWT against issuer JWKS
 */
export async function validateSSOToken(
  tenant: EnterpriseTenant,
  token: string,
): Promise<SSOUser> {
  if (!tenant.ssoConfig) {
    throw new Error(`[ESA-SSO] Tenant ${tenant.id} has no SSO configuration`);
  }

  const { ssoConfig } = tenant;

  if (ssoConfig.type === 'saml') {
    return validateSAMLAssertion(tenant, token);
  }

  if (ssoConfig.type === 'oidc') {
    return validateOIDCToken(tenant, token);
  }

  throw new Error(`[ESA-SSO] Unknown SSO type: ${ssoConfig.type}`);
}

/**
 * SAML assertion validation stub.
 * Production: use `@node-saml/node-saml` or `passport-saml`.
 */
async function validateSAMLAssertion(
  tenant: EnterpriseTenant,
  _assertion: string,
): Promise<SSOUser> {
  // SAML 구현은 saml2-js 또는 @node-saml/node-saml 패키지 도입 후 활성화.
  // 현재는 Firebase Auth SSO로 대체 운영.

  return {
    email: 'stub@' + tenant.domain,
    name: 'SSO User (stub)',
    tenantId: tenant.id,
    role: 'user',
    sessionExpiry: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * OIDC token validation stub.
 * Production: use `jose` library for JWT verification.
 */
async function validateOIDCToken(
  tenant: EnterpriseTenant,
  _token: string,
): Promise<SSOUser> {
  // OIDC 구현은 jose 패키지 도입 후 활성화.
  // 현재는 Firebase Auth OIDC로 대체 운영.
  // 5. Return SSOUser

  console.warn('[ESA-SSO] OIDC validation is STUB — implement for production');

  return {
    email: 'stub@' + tenant.domain,
    name: 'SSO User (stub)',
    tenantId: tenant.id,
    role: 'user',
    sessionExpiry: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Initiate SSO login flow — returns redirect URL.
 */
export function getSSOLoginUrl(tenant: EnterpriseTenant, callbackUrl: string): string {
  if (!tenant.ssoConfig) {
    throw new Error(`[ESA-SSO] Tenant ${tenant.id} has no SSO configuration`);
  }

  const { ssoConfig } = tenant;

  if (ssoConfig.type === 'oidc') {
    const params = new URLSearchParams({
      client_id: ssoConfig.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state: tenant.id,
    });
    return `${ssoConfig.issuerUrl}/authorize?${params.toString()}`;
  }

  if (ssoConfig.type === 'saml') {
    // SAML: redirect to IdP with SAMLRequest
    return `${ssoConfig.issuerUrl}/sso/saml?RelayState=${encodeURIComponent(callbackUrl)}`;
  }

  throw new Error(`[ESA-SSO] Unknown SSO type: ${ssoConfig.type}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Feature Checking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if an enterprise tenant has a specific feature enabled.
 */
export function checkEnterpriseFeature(
  tenantId: string,
  feature: EnterpriseFeature,
): boolean {
  const tenant = TENANT_REGISTRY.get(tenantId);
  if (!tenant) return false;
  return tenant.features.includes(feature);
}

/**
 * Get enterprise limits for a tenant.
 */
export function getEnterpriseLimits(tenantId: string): EnterpriseLimits {
  const tenant = TENANT_REGISTRY.get(tenantId);

  if (!tenant) {
    return {
      maxUsers: 0,
      maxCalculationsPerDay: 0,
      maxStorageGB: 0,
      maxApiCallsPerHour: 0,
      retentionDays: 0,
    };
  }

  const isPlus = tenant.plan === 'enterprise_plus';

  return {
    maxUsers: tenant.maxUsers,
    maxCalculationsPerDay: isPlus ? Infinity : 10000,
    maxStorageGB: isPlus ? 1000 : 100,
    maxApiCallsPerHour: isPlus ? 50000 : 5000,
    retentionDays: isPlus ? 3650 : 365,
  };
}

/**
 * Get the custom LLM provider for an enterprise tenant (if configured).
 * Falls back to default provider.
 */
export function getEnterpriseProvider(tenantId: string): string | null {
  const tenant = TENANT_REGISTRY.get(tenantId);
  if (!tenant) return null;
  if (!tenant.features.includes('custom_llm')) return null;
  return tenant.customLLM ?? null;
}
