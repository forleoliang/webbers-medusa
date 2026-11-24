import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Prompt, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

const CustomerAnonymizeWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const enabled = useFeatureEnabled("anonymizeCustomer")

  const { data: currentUser } = useQuery({
    queryKey: ["current-admin-user"],
    queryFn: () => sdk.admin.user.me(),
    enabled,
  })

  const anonymizeMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/customers/${data.id}/anonymize`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      setOpen(false)
      toast.success("Customer anonymized")
    },
    onError: (e: Error) => {
      toast.error(e.message || "Error anonymizing customer")
    },
  })

  if (!enabled || !currentUser?.user?.metadata?.superadmin) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">AVG / GDPR</Heading>
      </div>
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Permanently removes all personal data for this customer (AVG/GDPR request). This action cannot be undone.
        </Text>
        <div>
          <Button size="small" variant="danger" onClick={() => setOpen(true)}>
            Anonymize customer
          </Button>
        </div>
      </div>

      <Prompt open={open} onOpenChange={setOpen}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Anonymize customer?</Prompt.Title>
            <Prompt.Description>
              This will permanently remove all personal data (name, address, phone, email, reviews, review requests,
              and wishlists) across customer, order, cart, and configured extension records. This action cannot be undone.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel disabled={anonymizeMutation.isPending}>Cancel</Prompt.Cancel>
            <Prompt.Action
              onClick={() => anonymizeMutation.mutate()}
              disabled={anonymizeMutation.isPending}
            >
              {anonymizeMutation.isPending ? "Anonymizing..." : "Anonymize"}
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.side.before",
})

export default CustomerAnonymizeWidget
