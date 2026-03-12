export { CAPABILITY_CONTRACT, INTEGRATION_CONTRACT } from './contract.js'
export type {
  CapabilityDeclaration,
  CapabilityType,
  TrustLevel,
  MinimumTrust,
  CapabilityReliability,
  CapabilityStatus,
  CapabilityPattern,
  CapabilityTokenScope,
  KnownSignalSource,
  ScopeDeclaration,
  GrantDeclaration,
  ScopeType,
  GrantType,
  GrantTrustLevel,
  // Pattern 6: resolution + data access
  ResolvedCapability,
  DataAccessResult,
  DataCredentialPayload,
  // RFC types (typed, not yet implemented)
  AttributionClaim,
  Correction,
  // Sideslip routing types (RFC #35)
  RoutingOutcome,
  SaturationSignal,
  // Deprecated aliases
  IntegrationPattern,
  IntegrationTokenScope,
} from './contract.js'
export type { AuthTier } from './contract.js'
export { THRESHOLD_AUDITOR_PROMPT, AUDITOR_VERSION } from './prompts/auditor.js'
