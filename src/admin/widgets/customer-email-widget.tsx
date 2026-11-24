import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Input, Label, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

const CustomerEmailWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => {
  const { t } = useTranslation()
  const [email, setEmail] = useState(data.email ?? "")
  const queryClient = useQueryClient()
  const enabled = useFeatureEnabled("editCustomerEmail")

  useEffect(() => {
    setEmail(data.email ?? "")
  }, [data.id, data.email])

  const mutation = useMutation({
    mutationFn: (nextEmail: string) =>
      sdk.client.fetch(`/admin/customers/${data.id}/edit-email`, {
        method: "POST",
        body: { email: nextEmail },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] })
      await queryClient.invalidateQueries({ queryKey: ["customer", data.id] })
      toast.success(t("extensions.customerEmail.toastSaved"))
    },
    onError: (e: Error) => {
      toast.error(e.message || t("extensions.customerEmail.toastFailed"))
    },
  })

  if (!enabled || !data.has_account) {
    return null
  }

  const trimmed = email.trim()
  const isDirty = trimmed.length > 0 && trimmed !== (data.email ?? "")

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("extensions.customerEmail.title")}</Heading>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (isDirty) mutation.mutate(trimmed)
        }}
        className="flex flex-col gap-y-3 px-6 py-4"
      >
        <div className="flex flex-col gap-y-1.5">
          <Label size="small" weight="plus" htmlFor={`customer-email-${data.id}`}>
            {t("extensions.customerEmail.label")}
          </Label>
          <Input
            id={`customer-email-${data.id}`}
            size="small"
            type="email"
            value={email}
            disabled={mutation.isPending}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-x-3">
          <Button
            size="small"
            variant="primary"
            type="submit"
            disabled={!isDirty || mutation.isPending}
            isLoading={mutation.isPending}
          >
            {t("extensions.customerEmail.save")}
          </Button>
        </div>
      </form>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.side",
})

export default CustomerEmailWidget
