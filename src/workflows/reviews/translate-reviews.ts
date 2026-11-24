import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { translateReviewsStep, type TranslateReviewsInput } from "./steps/translate-reviews"

export const translateReviewsWorkflowId = "translate-reviews"

/** Machine-translates review titles and bodies into configured target languages under `metadata.translations`. */
export const translateReviewsWorkflow = createWorkflow(
  translateReviewsWorkflowId,
  function (input: TranslateReviewsInput) {
    const ids = translateReviewsStep(input)
    return new WorkflowResponse(ids)
  }
)
