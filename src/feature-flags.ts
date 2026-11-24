// Single source of truth for all toggleable features in the unified plugin.
// Pure constants only (no imports) so it can be shared by both the server build
// and the admin (vite) build.

export type FeatureCategory = 'reviews_wishlist' | 'customer_order' | 'promotions_pricing';

export type WebbersFeatureKey =
  | 'reviews'
  | 'reviewRequests'
  | 'reviewTranslations'
  | 'kiyohSync'
  | 'wishlist'
  | 'notes'
  | 'anonymizeCustomer'
  | 'transferGuestOrders'
  | 'editCustomerEmail'
  | 'orderDiscountBreakdown'
  | 'orderNotifications'
  | 'alwaysFreePromotion'
  | 'disallowPriceListDiscounts'
  | 'uniqueCouponCodes';

export type WebbersFeatureDefinition = {
  key: WebbersFeatureKey;
  category: FeatureCategory;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export const WEBBERS_FEATURES: WebbersFeatureDefinition[] = [
  // --- Reviews & Wishlist ---
  {
    key: 'reviews',
    category: 'reviews_wishlist',
    label: 'Product reviews',
    description: 'Verified-purchase reviews, ratings, Admin moderation table, and Product/Order review widgets.',
    defaultEnabled: true,
  },
  {
    key: 'reviewRequests',
    category: 'reviews_wishlist',
    label: 'Review request emails',
    description: 'Automated post-purchase review invitations, magic links, and Admin request management.',
    defaultEnabled: true,
  },
  {
    key: 'reviewTranslations',
    category: 'reviews_wishlist',
    label: 'Review translations',
    description: 'On-demand Google Translate machine translations for review titles and bodies.',
    defaultEnabled: true,
  },
  {
    key: 'kiyohSync',
    category: 'reviews_wishlist',
    label: 'Kiyoh review sync',
    description: 'Scheduled daily import of external Kiyoh reviews matched to Medusa orders.',
    defaultEnabled: false,
  },
  {
    key: 'wishlist',
    category: 'reviews_wishlist',
    label: 'Customer & guest wishlist',
    description: 'Storefront wishlists, guest-to-customer merge, share links, and saved counts.',
    defaultEnabled: true,
  },
  // --- Customer & Order Tools ---
  {
    key: 'notes',
    category: 'customer_order',
    label: 'Notes',
    description: 'Free-text notes on customer and order detail pages.',
    defaultEnabled: true,
  },
  {
    key: 'anonymizeCustomer',
    category: 'customer_order',
    label: 'Anonymize customer',
    description: 'AVG/GDPR data scrub action on the customer page across orders, carts, reviews, and wishlists (superadmin only).',
    defaultEnabled: true,
  },
  {
    key: 'transferGuestOrders',
    category: 'customer_order',
    label: 'Transfer guest orders',
    description: 'Merge unassigned guest orders into a customer account.',
    defaultEnabled: true,
  },
  {
    key: 'editCustomerEmail',
    category: 'customer_order',
    label: 'Edit customer email',
    description: "Change a registered customer's email from the customer page.",
    defaultEnabled: true,
  },
  {
    key: 'orderDiscountBreakdown',
    category: 'customer_order',
    label: 'Order discount breakdown',
    description: 'Summary of discount codes applied to an order.',
    defaultEnabled: true,
  },
  {
    key: 'orderNotifications',
    category: 'customer_order',
    label: 'Order notifications',
    description: 'List of transactional emails sent for an order.',
    defaultEnabled: true,
  },
  // --- Promotions & Pricing ---
  {
    key: 'alwaysFreePromotion',
    category: 'promotions_pricing',
    label: 'Always-free promotion',
    description: 'Free-shipping toggle on the promotion page (widget only).',
    defaultEnabled: true,
  },
  {
    key: 'disallowPriceListDiscounts',
    category: 'promotions_pricing',
    label: 'Disallow price-list discounts',
    description: 'Toggle on a price list to stop discount codes from overriding its prices.',
    defaultEnabled: true,
  },
  {
    key: 'uniqueCouponCodes',
    category: 'promotions_pricing',
    label: 'Unique coupon codes',
    description: 'Generate single-use codes from a template promotion on the campaign page, with a CSV download.',
    defaultEnabled: true,
  },
];

export const WEBBERS_FEATURE_KEYS: WebbersFeatureKey[] = WEBBERS_FEATURES.map((f) => f.key);

export const WEBBERS_FEATURE_DEFAULTS: Record<WebbersFeatureKey, boolean> = Object.fromEntries(
  WEBBERS_FEATURES.map((f) => [f.key, f.defaultEnabled])
) as Record<WebbersFeatureKey, boolean>;

// Fallback default when no row exists and the key is unknown.
export const DEFAULT_FEATURE_ENABLED = true;

export const getDefaultFeatureEnabled = (key: WebbersFeatureKey | string): boolean =>
  (WEBBERS_FEATURE_DEFAULTS as Record<string, boolean>)[key] ?? DEFAULT_FEATURE_ENABLED;
