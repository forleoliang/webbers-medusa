import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCampaign, DetailWidgetProps } from "@medusajs/framework/types"
import { ArrowDownTray } from "@medusajs/icons"
import { Button, Container, Heading, Hint, Input, Label, Select, Skeleton, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { formatDateTime } from "../lib/api"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

// Mirror the limits of the API validator.
const MAX_QUANTITY = 2000
const PREFIX_REGEX = /^([A-Z0-9]{2,12})?$/

type CouponTemplate = { id: string; code: string; status: string }

type CouponBatch = {
  id: string
  created_at: string | null
  prefix: string
  total: number
  used: number
}

type CouponCodesResponse = { templates: CouponTemplate[]; batches: CouponBatch[] }

// One code per line without a header row, the format Klaviyo's "Upload codes" takes.
const downloadCsv = (codes: string[], filename: string) => {
  const url = URL.createObjectURL(new Blob([codes.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const csvFilename = (prefix: string, createdAt?: string | null) =>
  `coupon-codes-${prefix ? `${prefix.toLowerCase()}-` : ""}${(createdAt ?? new Date().toISOString()).slice(0, 10)}.csv`

const CampaignCouponCodesWidget = ({ data: campaign }: DetailWidgetProps<AdminCampaign>) => {
  const { t, i18n } = useTranslation()
  const enabled = useFeatureEnabled("uniqueCouponCodes")
  const queryClient = useQueryClient()
  const queryKey = ["campaign-coupon-codes", campaign.id]

  const [templateId, setTemplateId] = useState("")
  const [quantity, setQuantity] = useState("500")
  const [prefix, setPrefix] = useState("")

  const { data, isLoading } = useQuery<CouponCodesResponse>({
    queryKey,
    queryFn: () => sdk.client.fetch<CouponCodesResponse>(`/admin/campaigns/${campaign.id}/coupon-codes`),
    enabled,
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ batch_id: string; codes: string[] }>(`/admin/campaigns/${campaign.id}/coupon-codes`, {
        method: "POST",
        body: { template_promotion_id: templateId, quantity: Number(quantity), prefix },
      }),
    onSuccess: async ({ codes }) => {
      downloadCsv(codes, csvFilename(prefix))
      toast.success(t("extensions.couponCodes.generated", { count: codes.length }))
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error: Error) => {
      toast.error(t("extensions.couponCodes.error"), { description: error.message })
    },
  })

  const downloadMutation = useMutation({
    mutationFn: async (batch: CouponBatch) => {
      const { codes } = await sdk.client.fetch<{ codes: { code: string }[] }>(
        `/admin/campaigns/${campaign.id}/coupon-codes/${batch.id}`
      )

      downloadCsv(
        codes.map(({ code }) => code),
        csvFilename(batch.prefix, batch.created_at)
      )
    },
    onError: () => {
      toast.error(t("extensions.couponCodes.downloadError"))
    },
  })

  if (!enabled) return null

  const templates = data?.templates ?? []
  const batches = data?.batches ?? []
  const quantityNumber = Number(quantity)
  const isQuantityValid = Number.isInteger(quantityNumber) && quantityNumber >= 1 && quantityNumber <= MAX_QUANTITY
  const isValid = !!templateId && PREFIX_REGEX.test(prefix) && isQuantityValid

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("extensions.couponCodes.title")}</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("extensions.couponCodes.subtitle")}
        </Text>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-48" />
        </div>
      ) : templates.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("extensions.couponCodes.noTemplates")}
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-y-1">
              <Label size="small" weight="plus">
                {t("extensions.couponCodes.template")}
              </Label>
              <Select size="small" value={templateId} onValueChange={setTemplateId}>
                <Select.Trigger>
                  <Select.Value placeholder={t("extensions.couponCodes.templatePlaceholder")} />
                </Select.Trigger>
                <Select.Content>
                  {templates.map((template) => (
                    <Select.Item key={template.id} value={template.id}>
                      {template.code}
                      {template.status === "draft" ? ` (${t("extensions.couponCodes.draft")})` : ""}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small" weight="plus" htmlFor="coupon-prefix">
                {t("extensions.couponCodes.prefix")}
              </Label>
              <Input
                id="coupon-prefix"
                size="small"
                value={prefix}
                maxLength={12}
                aria-invalid={!PREFIX_REGEX.test(prefix)}
                onChange={(event) => setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small" weight="plus" htmlFor="coupon-quantity">
                {t("extensions.couponCodes.quantity", { max: MAX_QUANTITY })}
              </Label>
              <Input
                id="coupon-quantity"
                size="small"
                type="number"
                min={1}
                max={MAX_QUANTITY}
                value={quantity}
                aria-invalid={quantity !== "" && !isQuantityValid}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-x-4">
            <Hint>
              {t("extensions.couponCodes.prefixHint", {
                example: prefix ? `${prefix}-K7M2X9QP` : "K7M2-X9QP-4HTB",
              })}
            </Hint>
            <Button
              size="small"
              disabled={!isValid || generateMutation.isPending}
              isLoading={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {t("extensions.couponCodes.submit")}
            </Button>
          </div>
        </div>
      )}

      {batches.length > 0 ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("extensions.couponCodes.createdAt")}</Table.HeaderCell>
              <Table.HeaderCell>{t("extensions.couponCodes.batchPrefix")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("extensions.couponCodes.total")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("extensions.couponCodes.used")}</Table.HeaderCell>
              <Table.HeaderCell className="text-right">{t("extensions.couponCodes.remaining")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {batches.map((batch) => (
              <Table.Row key={batch.id}>
                <Table.Cell>{formatDateTime(batch.created_at, i18n.language)}</Table.Cell>
                <Table.Cell>{batch.prefix || "-"}</Table.Cell>
                <Table.Cell className="text-right">{batch.total}</Table.Cell>
                <Table.Cell className="text-right">{batch.used}</Table.Cell>
                <Table.Cell className="text-right">{batch.total - batch.used}</Table.Cell>
                <Table.Cell className="text-right">
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={downloadMutation.isPending}
                    onClick={() => downloadMutation.mutate(batch)}
                  >
                    <ArrowDownTray /> {t("extensions.couponCodes.download")}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : (
        !isLoading &&
        templates.length > 0 && (
          <div className="px-6 py-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("extensions.couponCodes.empty")}
            </Text>
          </div>
        )
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "campaign.details.after",
})

export default CampaignCouponCodesWidget
