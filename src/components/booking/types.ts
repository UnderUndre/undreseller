export interface ComputedSlotDTO {
  start: string
  end: string
}

export interface AvailabilityResponse {
  service: string
  date: string
  resourceId: string
  timeZone: string
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
