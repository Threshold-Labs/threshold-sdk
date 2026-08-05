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
export {
  MINIMUM_TRUST_ORDER,
  trustAtLeast,
  derivePoolMembership,
  poolCapabilityDeclaration,
  isOptedOut,
  filterOptedOut,
  gatePoolRequest,
} from './pool.js'
export type {
  TrustEdge,
  PoolDeclaration,
  PoolMember,
  ConsentScope,
  OptOutRecord,
  FilterOptedOutOptions,
  PoolGateResult,
} from './pool.js'
export { ThresholdClient } from './client.js'
export type {
  ThresholdClientOptions,
  ThresholdClientErrorContext,
} from './client.js'
