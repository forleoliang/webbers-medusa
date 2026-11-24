import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Prompt, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

const CustomerAnonymizeWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => {
  const { t } = useTranslation()
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
      toast.success(t("extensions.anonymize.toastSuccess"))
    },
    onError: (e: Error) => {
      toast.error(e.message || t("extensions.anonymize.toastFailed"))
    },
  })

  if (!enabled || !currentUser?.user?.metadata?.superadmin) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("extensions.anonymize.title")}</Heading>
      </div>
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("extensions.anonymize.description")}
        </Text>
        <div>
          <Button size="small" variant="danger" onClick={() => setOpen(true)}>
            {t("extensions.anonymize.action")}
          </Button>
        </div>
      </div>

      <Prompt open={open} onOpenChange={setOpen}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{t("extensions.anonymize.confirmTitle")}</Prompt.Title>
            <Prompt.Description>{t("extensions.anonymize.confirmDescription")}</Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel disabled={anonymizeMutation.isPending}>
              {t("extensions.anonymize.cancel")}
            </Prompt.Cancel>
            <Prompt.Action
              onClick={() => anonymizeMutation.mutate()}
              disabled={anonymizeMutation.isPending}
            >
              {anonymizeMutation.isPending
                ? t("extensions.anonymize.confirmLoading")
                : t("extensions.anonymize.confirm")}
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
