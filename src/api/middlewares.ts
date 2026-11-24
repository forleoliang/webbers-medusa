import {
  authenticate,
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  type MiddlewareVerb,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z, type ZodRawShape } from "@medusajs/framework/zod"
import * as CartsQueryConfig from "@medusajs/medusa/api/store/carts/query-config"
import { StoreAddCartLineItem, StoreGetCartsCart } from "@medusajs/medusa/api/store/carts/validators"
import multer from "multer"
import { WebbersFeatureKey } from "../feature-flags"
import { WEBBERS_SETTINGS_MODULE } from "../modules/webbers-settings"
import WebbersSettingsService from "../modules/webbers-settings/service"
import { PostAdminGenerateCouponCodes } from "./admin/campaigns/[id]/coupon-codes/validators"
import { PostEditEmail } from "./admin/customers/[id]/edit-email/validators"
import { PostAdminEditNote } from "./admin/note/validators"
import { PatchAdminUpdatePriceListExt } from "./admin/price-lists/[id]/ext/validators"
import { PostWebbersSettings } from "./admin/webbers-medusa/settings/validators"
import {
  AdminAnalyticsQuery,
  AdminBatchReviews,
  AdminListReviewRequests,
  AdminListReviews,
  AdminRefreshRatings,
  AdminReply,
  AdminScheduleReviewRequest,
  AdminTranslateReviews,
  AdminUpdateReview,
  StoreCreateReviews,
  StoreEligibility,
  StoreListReviews,
  StoreRatings,
  StoreWishlistAddItem,
  StoreWishlistCounts,
  StoreWishlistMerge,
} from "./validators"

// Rejects the request with 403 when the given feature has been disabled from Store Extensions settings.
const featureGuard =
  (key: WebbersFeatureKey) => async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    const service: WebbersSettingsService = req.scope.resolve(WEBBERS_SETTINGS_MODULE)
    const enabled = await service.isEnabled(key)
    if (!enabled) {
      res.status(403).json({ message: `The "${key}" feature is disabled.` })
      return
    }
    return next()
  }

// `/admin/reviews/:id` matches `/admin/reviews/config` and `/admin/reviews/stats`; let `/admin/reviews/config` pass.
const reviewByIdGuard = async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  if (req.params.id === "config") {
    return next()
  }
  return featureGuard("reviews")(req, res, next)
}

// Photo upload hard ceiling; exact size and count limits are re-checked against plugin options in the route.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 10 } })

const customerOptional = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })
const customerRequired = authenticate("customer", ["session", "bearer"])

export default defineMiddlewares({
  routes: [
    // --- Notes ---
    {
      matcher: "/admin/note",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("notes")],
    },
    {
      matcher: "/admin/note",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("notes"), validateAndTransformBody(PostAdminEditNote)],
    },
    // --- Anonymize customer ---
    {
      matcher: "/admin/customers/:id/anonymize",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("anonymizeCustomer")],
    },
    // --- Transfer guest orders ---
    {
      matcher: "/admin/customers/:id/merge-guest-orders",
      methods: ["GET", "POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("transferGuestOrders")],
    },
    // --- Edit customer email ---
    {
      matcher: "/admin/customers/:id/edit-email",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("editCustomerEmail"), validateAndTransformBody(PostEditEmail)],
    },
    // --- Order notifications ---
    {
      matcher: "/admin/orders/:id/notifications",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("orderNotifications")],
    },
    // --- Disallow price-list discounts ---
    {
      matcher: "/admin/price-lists/:id/ext",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("disallowPriceListDiscounts")],
    },
    {
      matcher: "/admin/price-lists/:id/ext",
      methods: ["PATCH"] as MiddlewareVerb[],
      middlewares: [
        featureGuard("disallowPriceListDiscounts"),
        validateAndTransformBody(PatchAdminUpdatePriceListExt),
      ],
    },
    {
      matcher: "/store/carts/:id/line-item-price-list",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [
        validateAndTransformBody(StoreAddCartLineItem),
        validateAndTransformQuery(StoreGetCartsCart, CartsQueryConfig.retrieveTransformQueryConfig),
      ],
    },
    // --- Always-free promotion: whitelist the additional_data field ---
    {
      matcher: "/admin/promotions",
      methods: ["POST"] as MiddlewareVerb[],
      additionalDataValidator: {
        always_free: z.boolean().optional(),
      } as ZodRawShape,
    },
    {
      matcher: "/admin/promotions/:id",
      methods: ["POST"] as MiddlewareVerb[],
      additionalDataValidator: {
        always_free: z.boolean().nullish(),
      } as ZodRawShape,
    },
    // --- Unique coupon codes ---
    {
      matcher: "/admin/campaigns/:id/coupon-codes",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("uniqueCouponCodes")],
    },
    {
      matcher: "/admin/campaigns/:id/coupon-codes",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("uniqueCouponCodes"), validateAndTransformBody(PostAdminGenerateCouponCodes)],
    },
    {
      matcher: "/admin/campaigns/:id/coupon-codes/:batch_id",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("uniqueCouponCodes")],
    },
    // --- Settings page API ---
    {
      matcher: "/admin/webbers-medusa/settings",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [validateAndTransformBody(PostWebbersSettings)],
    },
    // --- Verified Reviews (Store) ---
    {
      matcher: "/store/reviews",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), validateAndTransformQuery(StoreListReviews, {})],
    },
    {
      matcher: "/store/reviews",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), customerOptional, validateAndTransformBody(StoreCreateReviews)],
    },
    {
      matcher: "/store/reviews/ratings",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), validateAndTransformQuery(StoreRatings, {})],
    },
    {
      matcher: "/store/reviews/uploads",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), customerOptional, upload.array("files") as unknown as (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => void],
    },
    {
      matcher: "/store/reviews/eligibility",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), customerRequired, validateAndTransformQuery(StoreEligibility, {})],
    },
    {
      matcher: "/store/customers/me/reviews",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), customerRequired],
    },
    // --- Review Requests (Store & Public Unsubscribe) ---
    {
      matcher: "/store/reviews/requests*",
      middlewares: [featureGuard("reviews"), featureGuard("reviewRequests")],
    },
    {
      matcher: "/reviews/unsubscribe*",
      middlewares: [featureGuard("reviews"), featureGuard("reviewRequests")],
    },
    // --- Wishlist (Store) ---
    {
      matcher: "/store/wishlist",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("wishlist"), customerOptional],
    },
    {
      matcher: "/store/wishlist/items",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("wishlist"), customerOptional, validateAndTransformBody(StoreWishlistAddItem)],
    },
    {
      matcher: "/store/wishlist/items/:id",
      methods: ["DELETE"] as MiddlewareVerb[],
      middlewares: [featureGuard("wishlist"), customerOptional],
    },
    {
      matcher: "/store/wishlist/merge",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("wishlist"), customerRequired, validateAndTransformBody(StoreWishlistMerge)],
    },
    {
      matcher: "/store/wishlist/share",
      methods: ["POST", "DELETE"] as MiddlewareVerb[],
      middlewares: [featureGuard("wishlist"), customerRequired],
    },
    {
      matcher: "/store/wishlist/counts",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("wishlist"), validateAndTransformQuery(StoreWishlistCounts, {})],
    },
    {
      matcher: "/store/wishlists/shared*",
      middlewares: [featureGuard("wishlist")],
    },
    // --- Reviews & Translations & Requests (Admin) ---
    {
      matcher: "/admin/reviews/config",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [],
    },
    {
      matcher: "/admin/reviews",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), validateAndTransformQuery(AdminListReviews, {})],
    },
    {
      matcher: "/admin/reviews/stats",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews")],
    },
    {
      matcher: "/admin/reviews/batch",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), validateAndTransformBody(AdminBatchReviews)],
    },
    {
      matcher: "/admin/reviews/ratings/refresh",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), validateAndTransformBody(AdminRefreshRatings)],
    },
    {
      matcher: "/admin/reviews/translate",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [
        featureGuard("reviews"),
        featureGuard("reviewTranslations"),
        validateAndTransformBody(AdminTranslateReviews),
      ],
    },
    {
      matcher: "/admin/reviews/:id",
      methods: ["GET", "DELETE"] as MiddlewareVerb[],
      middlewares: [reviewByIdGuard],
    },
    {
      matcher: "/admin/reviews/:id",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), validateAndTransformBody(AdminUpdateReview)],
    },
    {
      matcher: "/admin/reviews/:id/reply",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), validateAndTransformBody(AdminReply)],
    },
    {
      matcher: "/admin/reviews/:id/reply",
      methods: ["DELETE"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews")],
    },
    {
      matcher: "/admin/reviews/:id/images/:image_id",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews")],
    },
    {
      matcher: "/admin/reviews/:id/translate",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), featureGuard("reviewTranslations")],
    },
    {
      matcher: "/admin/review-requests",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [
        featureGuard("reviews"),
        featureGuard("reviewRequests"),
        validateAndTransformQuery(AdminListReviewRequests, {}),
      ],
    },
    {
      matcher: "/admin/review-requests/schedule",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [
        featureGuard("reviews"),
        featureGuard("reviewRequests"),
        validateAndTransformBody(AdminScheduleReviewRequest),
      ],
    },
    {
      matcher: "/admin/review-requests/:id/send",
      methods: ["POST"] as MiddlewareVerb[],
      middlewares: [featureGuard("reviews"), featureGuard("reviewRequests")],
    },
    {
      matcher: "/admin/analytics/overview",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [
        featureGuard("storeAnalytics"),
        validateAndTransformQuery(AdminAnalyticsQuery, {}),
      ],
    },
    {
      matcher: "/admin/analytics/export",
      methods: ["GET"] as MiddlewareVerb[],
      middlewares: [
        featureGuard("storeAnalytics"),
        validateAndTransformQuery(AdminAnalyticsQuery, {}),
      ],
    },
  ],
})
