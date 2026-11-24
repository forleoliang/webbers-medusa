import { StatusBadge as MedusaStatusBadge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { STATUS_COLOR } from "../lib/api"

export const StatusBadge = ({
  status,
  kind = "review",
}: {
  status: string
  kind?: "review" | "request"
}) => {
  const { t } = useTranslation()
  const color = (STATUS_COLOR[status] ?? "grey") as "green" | "red" | "orange" | "blue" | "purple" | "grey"

  return (
    <MedusaStatusBadge color={color}>
      {t(`reviews.${kind === "review" ? "status" : "requestStatus"}.${status}`, {
        defaultValue: status,
      })}
    </MedusaStatusBadge>
  )
}
