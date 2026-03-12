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
  // Deprecated aliases
  IntegrationPattern,
  IntegrationTokenScope,
} from './contract.js'
export type { AuthTier } from './contract.js'
export { declareCapability, resolveCapability, requestDataAccess, readCapabilityData, composeCapabilities } from './capability.js'
export type { DeclareCapabilityOptions, DeclareCapabilityResult, ResolveCapabilityOptions, RequestDataAccessOptions, ReadCapabilityDataOptions, ComposeCapabilitiesOptions } from './capability.js'
export { THRESHOLD_AUDITOR_PROMPT, AUDITOR_VERSION } from './prompts/auditor.js'
