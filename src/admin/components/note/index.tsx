import React, { useEffect, useState } from "react"
import { Button, Container, Heading, Skeleton, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { sdk } from "../../lib/sdk"

type Note = {
  id: string
  note: string
}

type NoteResponse = {
  note?: Note | null
}

type NoteUpdateResponse = {
  note: Note
}

const NoteWidget = ({ entityType, entityId }: { entityType: string; entityId: string }) => {
  const { t } = useTranslation()
  const [note, setNote] = useState("")
  const queryClient = useQueryClient()
  const queryKey = ["webbers-note", entityType, entityId]

  const { data: result, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<NoteResponse>("/admin/note", {
        query: { entity_id: entityId, entity_type: entityType },
      }),
    queryKey,
  })

  const savedText = result?.note?.note ?? ""

  useEffect(() => {
    setNote(savedText)
  }, [entityType, entityId, savedText])

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      sdk.client.fetch<NoteUpdateResponse>("/admin/note", {
        method: "POST",
        body: {
          note,
          type: entityType,
          note_id: result?.note?.id,
          type_id: entityId,
        },
      }),
    onSuccess: async () => {
      toast.success(t("extensions.note.toastSaved"))
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: Error) => {
      toast.error(err.message || t("extensions.note.toastFailed"))
    },
  })

  const isDirty = note !== savedText

  const title =
    entityType === "customer"
      ? t("extensions.note.customerTitle")
      : entityType === "order"
        ? t("extensions.note.orderTitle")
        : t("extensions.note.genericTitle")

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isDirty) mutate()
  }

  return (
    <Container className="p-0">
      <form onSubmit={onSave} className="divide-y">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">{title}</Heading>
          <Button
            size="small"
            variant="primary"
            disabled={isLoading || isPending || !isDirty}
            type="submit"
            isLoading={isPending}
          >
            {t("extensions.note.save")}
          </Button>
        </div>

        <div className="flex flex-col gap-y-3 px-6 py-4">
          {isLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <Textarea
              name="note"
              rows={5}
              value={note}
              disabled={isPending}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </div>
      </form>
    </Container>
  )
}

export default NoteWidget
