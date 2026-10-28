/** Pure reason -> HTTP status/payload mapping (unit-tested). Route files may only export HTTP handlers. */

export type JoinFailureReason =
  | 'VALIDATION'
  | 'TELEGRAM_REQUIRED'
  | 'UNAUTHORIZED_INIT_DATA'
  | 'WINDOW_TOO_LONG'
  | 'TOO_MANY_ACTIVE'
  | 'DUPLICATE_ACTIVE'
  | 'ITEM_NOT_FOUND';

/** Pure reason → HTTP status/payload mapping (unit-tested). */
export function joinFailurePayload(reason: JoinFailureReason): { status: number; error: string } {
  switch (reason) {
    case 'TOO_MANY_ACTIVE':
      return {
        status: 429,
        error: 'You already have the maximum number of active waitlist entries (10). Cancel one before joining again.',
      };
    case 'DUPLICATE_ACTIVE':
      return {
        status: 409,
        error: 'You are already on the waitlist for this service in the selected window.',
      };
    case 'WINDOW_TOO_LONG':
      return { status: 400, error: 'The waitlist window cannot exceed 30 days.' };
    case 'ITEM_NOT_FOUND':
      return { status: 404, error: 'Service not found or unavailable.' };
    case 'UNAUTHORIZED_INIT_DATA':
      return { status: 401, error: 'Invalid Telegram session. Re-open the Mini App and try again.' };
    case 'TELEGRAM_REQUIRED':
      return {
        status: 400,
        error: 'Joining the waitlist is available via Telegram only. Open the bot Mini App to join — offers arrive in Telegram.',
      };
    case 'VALIDATION':
      return { status: 400, error: 'Invalid waitlist join payload.' };
  }
}
