export interface ComputedSlotDTO {
  start: string
  end: string
}

/** Composite basket item (spec 014 FR-1405, T1432). */
export interface CompositeItemDTO {
  productId: string
  title: string
  durationMin: number
  priceInUSD: number
  addOn: boolean
}

export interface AvailabilityResponse {
  service: string
  date: string
  resourceId: string
  timeZone: string
  /** Container duration (Σ positions) — present for composite queries. */
  totalDurationMin?: number
  slots: ComputedSlotDTO[]
}

export interface BookingResponse {
  reservationId: string
  orderId: string
  accessToken: string
  cancelToken: string
  status: string
  scheduleVersion: number
}
