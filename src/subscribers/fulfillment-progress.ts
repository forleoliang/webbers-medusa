import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, FulfillmentWorkflowEvents } from "@medusajs/framework/utils"
import { orderIdOfFulfillment } from "../lib/eligibility"
import { scheduleReviewRequest } from "../lib/review-requests"
import { WEBBERS_SETTINGS_MODULE } from "../modules/webbers-settings"
import type WebbersSettingsService from "../modules/webbers-settings/service"

/** A fulfillment was shipped or delivered: schedule the order's review request if enabled and eligible. */
export default async function fulfillmentProgressHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const settings = container.resolve<WebbersSettingsService>(WEBBERS_SETTINGS_MODULE)
  if (!(await settings.isEnabled("reviews")) || !(await settings.isEnabled("reviewRequests"))) {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentId = event.data?.id
  if (!fulfillmentId) return
  const orderId = await orderIdOfFulfillment(container, fulfillmentId)
  if (!orderId) return
  const result = await scheduleReviewRequest(container, orderId)
  logger.debug(`[reviews] ${event.name} fulfillment ${fulfillmentId} -> order ${orderId}: ${result.status}`)
}

export const config: SubscriberConfig = {
  event: [FulfillmentWorkflowEvents.SHIPMENT_CREATED, FulfillmentWorkflowEvents.DELIVERY_CREATED],
}
