export { CAPABILITY_CONTRACT, INTEGRATION_CONTRACT } from './contract.js'
export type {
  CapabilityDeclaration,
  CapabilityType,
  TrustLevel,
  MinimumTrust,
  CapabilityReliability,
  CapabilityAvailability,
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
  // Custody lifecycle (#61)
  CustodyPhase,
  CustodyIdentityType,
  CustodyTerms,
  CustodyRecord,
  CustodyClaim,
  // RFC types (typed, not yet implemented)
  AttributionClaim,
  Correction,
  IdentityClaim,
  // Deprecated aliases
  IntegrationPattern,
  IntegrationTokenScope,
} from './contract.js'
export type { AuthTier } from './contract.js'
export { THRESHOLD_AUDITOR_PROMPT, AUDITOR_VERSION } from './prompts/auditor.js'
export {
  pushSignal,
  readSignal,
} from './signals.js'
export type {
  PushSignalOptions,
  PushSignalResult,
  ReadSignalOptions,
  SignalResponse,
} from './signals.js'
