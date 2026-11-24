import React, { useEffect, useState } from "react"
import { Button, Container, Heading, Skeleton, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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

function capitalizeFirstLetter(val: string) {
  return val.charAt(0).toUpperCase() + val.slice(1)
}

const NoteWidget = ({ entityType, entityId }: { entityType: string; entityId: string }) => {
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
      toast.success("Note updated successfully")
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save note")
    },
  })

  const isDirty = note !== savedText

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isDirty) mutate()
  }

  return (
    <Container className="p-0">
      <form onSubmit={onSave} className="divide-y">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">{capitalizeFirstLetter(entityType)} Note</Heading>
          <Button
            size="small"
            variant="primary"
            disabled={isLoading || isPending || !isDirty}
            type="submit"
            isLoading={isPending}
          >
            Save note
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
