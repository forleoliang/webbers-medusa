import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminPromotion, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Switch, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

type AdminPromotionAlwaysFree = AdminPromotion & {
  always_free?: {
    id: string
    always_free: boolean
  }
}

const PromotionAlwaysFreeWidget = ({ data: promotion }: DetailWidgetProps<AdminPromotion>) => {
  const dialog = usePrompt()
  const enabled = useFeatureEnabled("alwaysFreePromotion")
  const queryClient = useQueryClient()
  const queryKey = ["promotion-always-free", promotion.id]

  const { data: queryResult, isLoading } = useQuery({
    queryFn: () =>
      sdk.admin.promotion.retrieve(promotion.id, {
        fields: "+always_free.*",
      }),
    queryKey,
    enabled,
  })

  const alwaysFree = !!(queryResult?.promotion as AdminPromotionAlwaysFree | undefined)?.always_free?.always_free

  const mutation = useMutation({
    mutationFn: (nextValue: boolean) =>
      sdk.admin.promotion.update(promotion.id, {
        // @ts-expect-error additional_data extension
        additional_data: { always_free: nextValue },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ["promotion", promotion.id] })
      toast.success("Free shipping setting updated")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update free shipping setting")
    },
  })

  if (!enabled) {
    return null
  }

  const handleChange = async () => {
    const confirmed = await dialog({
      title: "Change free shipping?",
      description: "Are you sure you want to change the free shipping status?",
      variant: "confirmation",
      confirmText: "Confirm",
      cancelText: "Cancel",
    })

    if (confirmed) {
      mutation.mutate(!alwaysFree)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Free shipping</Heading>
        {isLoading ? (
          <Skeleton className="h-5 w-9 rounded-full" />
        ) : (
          <Switch
            id="always-free"
            checked={alwaysFree}
            disabled={mutation.isPending}
            onCheckedChange={handleChange}
          />
        )}
      </div>
      <div className="px-6 py-4">
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Marks this promotion as providing free shipping in supported storefronts.
        </Text>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "promotion.details.side.after",
})

export default PromotionAlwaysFreeWidget
