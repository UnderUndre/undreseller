export const MAX_CART_ITEMS = 10;
export const MAX_TOTAL_DURATION_MIN = 480;
export const MAX_CUSTOMER_NOTES_LENGTH = 1000;

export class CartValidationError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CartValidationError';
    this.code = code;
  }
}

export interface AuthoritativeServiceItem {
  id: string;
  title: string;
  priceMinor: number;
  starsPrice?: number | null;
  currency: string;
  itemType: 'PRODUCT' | 'SERVICE' | string;
  durationMin: number | null;
  isActive: boolean;
}

export interface OrderItemSnapshot {
  itemId: string;
  titleSnapshot: string;
  priceMinor: number;
  currency: string;
  durationMin: number;
  quantity: number;
  stockDecremented: number;
}

export interface ValidatedServiceCart {
  itemIds: string[];
  totalDurationMin: number;
  totalMinor: number;
  totalStarsPrice: number;
  currency: string;
  snapshots: OrderItemSnapshot[];
}

export function validateAndBuildServiceCart(
  requestedItemIds: string[],
  authoritativeItems: AuthoritativeServiceItem[]
): ValidatedServiceCart {
  if (!Array.isArray(requestedItemIds) || requestedItemIds.length === 0) {
    throw new CartValidationError('EMPTY_CART', 'Cart must contain at least one service item');
  }

  if (requestedItemIds.length > MAX_CART_ITEMS) {
    throw new CartValidationError(
      'MAX_ITEMS_EXCEEDED',
      `Cart cannot exceed ${MAX_CART_ITEMS} services per booking`
    );
  }

  const normalizedIds = requestedItemIds.map((id) => String(id).trim()).filter(Boolean);
  if (normalizedIds.length !== requestedItemIds.length) {
    throw new CartValidationError('INVALID_ITEM_ID', 'Cart contains empty or invalid item ID');
  }

  const uniqueSet = new Set(normalizedIds);
  if (uniqueSet.size !== normalizedIds.length) {
    throw new CartValidationError(
      'DUPLICATE_CART_ITEM',
      'Duplicate service items are not allowed in a single booking cart'
    );
  }

  const itemMap = new Map<string, AuthoritativeServiceItem>();
  for (const item of authoritativeItems) {
    itemMap.set(item.id, item);
  }

  let totalDurationMin = 0;
  let totalMinor = 0;
  let totalStarsPrice = 0;
  let cartCurrency: string | null = null;
  const snapshots: OrderItemSnapshot[] = [];

  for (const id of normalizedIds) {
    const item = itemMap.get(id);
    if (!item || !item.isActive || item.itemType !== 'SERVICE') {
      throw new CartValidationError(
        'UNAVAILABLE_CART_ITEM',
        `Service item ${id} is not found, inactive, or not a bookable service`
      );
    }

    if (typeof item.durationMin !== 'number' || !Number.isFinite(item.durationMin) || item.durationMin <= 0) {
      throw new CartValidationError(
        'NON_POSITIVE_DURATION',
        `Service item ${id} has non-positive or invalid duration`
      );
    }

    if (typeof item.priceMinor !== 'number' || item.priceMinor < 0) {
      throw new CartValidationError('INVALID_PRICE', `Service item ${id} has invalid price`);
    }

    const normalizedCurrency = item.currency.trim().toUpperCase();
    if (cartCurrency === null) {
      cartCurrency = normalizedCurrency;
    } else if (cartCurrency !== normalizedCurrency) {
      throw new CartValidationError(
        'MIXED_CART_CURRENCY',
        `Mixed currencies in cart are prohibited (${cartCurrency} vs ${normalizedCurrency})`
      );
    }

    totalDurationMin += item.durationMin;
    totalMinor += item.priceMinor;
    totalStarsPrice += item.starsPrice ?? Math.max(1, Math.round(item.priceMinor / 2));

    snapshots.push({
      itemId: item.id,
      titleSnapshot: item.title,
      priceMinor: item.priceMinor,
      currency: normalizedCurrency,
      durationMin: item.durationMin,
      quantity: 1,
      stockDecremented: 0,
    });
  }

  if (totalDurationMin > MAX_TOTAL_DURATION_MIN) {
    throw new CartValidationError(
      'MAX_DURATION_EXCEEDED',
      `Total service duration (${totalDurationMin} min) exceeds maximum allowed ${MAX_TOTAL_DURATION_MIN} minutes`
    );
  }

  return {
    itemIds: normalizedIds,
    totalDurationMin,
    totalMinor,
    totalStarsPrice,
    currency: cartCurrency || 'USD',
    snapshots,
  };
}

const HTML_SCRIPT_TAG_REGEX = /<[^>]*>/g;

export function sanitizeCustomerNotes(notes: string | null | undefined): string | null {
  if (notes === null || notes === undefined) {
    return null;
  }
  const trimmed = String(notes).replace(HTML_SCRIPT_TAG_REGEX, '').trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_CUSTOMER_NOTES_LENGTH) {
    throw new CartValidationError(
      'CUSTOMER_NOTES_TOO_LONG',
      `Customer notes cannot exceed ${MAX_CUSTOMER_NOTES_LENGTH} characters`
    );
  }
  return trimmed;
}
