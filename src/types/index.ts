export type FuelCode = 'RON92' | 'RON95' | 'DIESEL' | 'PREMIUM_DIESEL'

export type FuelStatus = 'AVAILABLE' | 'LIMITED' | 'OUT' | 'UNKNOWN'

export type QueueBucket =
  | 'MIN_0_15'
  | 'MIN_15_30'
  | 'MIN_30_60'
  | 'MIN_60_PLUS'
  | 'NONE'

export type ReporterRole =
  | 'VERIFIED_STATION'
  | 'TRUSTED'
  | 'CROWD'
  | 'ANON'

export type VoteType = 'CONFIRM' | 'DISAGREE'

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type SubscriptionTier = 'BASIC' | 'VERIFIED' | 'FLEET'
export type SubscriptionTierRequested = 'small' | 'medium' | 'large'
export type ReferralRewardStatus = 'PENDING' | 'PAID' | 'COLLECTED'

export type AlertTrigger = 'FUEL_BACK_IN_STOCK'

export type AlertChannel = 'PUSH' | 'EMAIL'

export type FuelStatuses = Partial<Record<FuelCode, FuelStatus>>

// ─── Database row types ───────────────────────────────────────────────────────

export interface FuelType {
  id: string
  code: FuelCode
  display_name_en: string
  display_name_my: string
  sort_order: number
}

export interface Station {
  id: string
  name: string
  /** ASCII-friendly name for emails and exports (from scraper). */
  name_for_emails?: string | null
  /** Contact phone (from trusted source). */
  phone?: string | null
  /** Station or brand website. */
  website?: string | null
  /** Opening hours JSON e.g. {"Monday": ["4AM-9PM"], ...}. */
  working_hours?: Record<string, string[]> | null
  /** Business/chain name from source (e.g. DENKO, Max Energy). */
  owner_title?: string | null
  brand: string | null
  lat: number
  lng: number
  address_text: string | null
  township: string
  city: string
  country_code: string
  is_verified: boolean
  verified_owner_id: string | null
  /** distributor = official list; crowd = 10 location reports; owner = claim+pay. Null = unverified (show grey). */
  verification_source?: 'distributor' | 'crowd' | 'owner' | null
  /** CamelCase alias from some API responses; use verification_source ?? verificationSource. */
  verificationSource?: 'distributor' | 'crowd' | 'owner' | null
  subscription_tier_requested?: SubscriptionTierRequested | null
  /** Snapshot when operator reported payment (aligned with b2b_pricing_config). */
  subscription_duration_months?: number | null
  subscription_price_list_mmk?: number | null
  subscription_price_promo_mmk?: number | null
  subscription_price_paid_mmk?: number | null
  subscription_promo_applied?: boolean | null
  subscription_promo_percent?: number | null
  payment_received_at?: string | null
  payment_reported_at?: string | null
  payment_method?: string | null
  payment_reference?: string | null
  payment_screenshot_path?: string | null
  payment_confirmed_by?: string | null
  referrer_user_id?: string | null
  station_photo_urls?: string[]
  location_photo_url?: string | null
  referral_paid_at?: string | null
  referral_reward_status?: ReferralRewardStatus | null
  recognition_photo_url?: string | null
  recognition_photo_confirmed?: boolean
  recognition_photo_updated_at?: string | null
  registration_reject_reason?: string | null
  registration_rejected_at?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StationStatusReport {
  id: string
  station_id: string
  reporter_user_id: string | null
  reporter_role: ReporterRole
  reported_at: string
  expires_at: string
  fuel_statuses: FuelStatuses
  queue_bucket: QueueBucket
  note: string | null
  device_hash: string
  is_flagged: boolean
  confirm_count?: number
  disagree_count?: number
}

export interface StatusVote {
  id: string
  report_id: string
  user_id: string | null
  device_hash: string
  vote: VoteType
  created_at: string
}

export interface StationCurrentStatus {
  station_id: string
  fuel_statuses_computed: FuelStatuses
  queue_bucket_computed: QueueBucket | null
  confidence_score: number
  source_role: ReporterRole | null
  last_updated_at: string | null
  is_stale: boolean
}

export interface StationClaim {
  id: string
  station_id: string
  user_id: string
  status: ClaimStatus
  submitted_at: string
  reviewed_at: string | null
  reviewer_id: string | null
}

export interface Subscription {
  id: string
  station_id: string
  user_id: string
  tier: SubscriptionTier
  starts_at: string
  ends_at: string | null
  active: boolean
}

export interface AlertsLog {
  id: string
  user_id: string
  station_id: string
  trigger: AlertTrigger
  channel: AlertChannel
  sent_at: string
}

export interface ReferralCode {
  user_id: string
  code: string
  created_at: string
}

export interface ReferralReward {
  id: string
  referrer_user_id: string
  station_id: string
  amount_mmk: number
  status: ReferralRewardStatus
  payment_reference: string | null
  paid_at: string | null
  created_at: string
}

// ─── Composite view types (used by the app) ──────────────────────────────────

export interface StationWithStatus extends Station {
  current_status: StationCurrentStatus | null
  distance_m?: number
}

// ─── UI / filter types ────────────────────────────────────────────────────────

export type StatusFilter = 'ALL' | 'HAS_FUEL' | 'LIMITED' | 'OUT'

export interface StationFilters {
  fuelTypes: FuelCode[]
  statusFilter: StatusFilter
  maxDistanceKm: number
  /** When set, B2B route view is active and stations are filtered to this route. */
  selectedRouteId: string | null
  /** When true, show only operator-verified stations (trusted locations). */
  verifiedOnly: boolean
}
