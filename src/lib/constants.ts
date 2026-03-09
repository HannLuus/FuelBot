/** Distance options for free users (km). Capped at 25 to avoid gaming (e.g. many devices covering the country). */
export const DISTANCE_OPTIONS_KM = [5, 25] as const

/** Max radius for free tier. */
export const MAX_FREE_RADIUS_KM = 25

/** Sentinel for "whole country" (B2B national view). Used when user has national_view entitlement. */
export const WHOLE_COUNTRY_KM = 2000
