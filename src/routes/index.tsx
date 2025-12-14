import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient, queryOptions, type QueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { toast } from 'sonner'
import { getNotes, createNote } from '@/server/functions'
import type { Note } from '@/types/note'
import { NoteTable } from '@/components/NoteTable'
import { CreateNoteModal } from '@/components/CreateNoteModal'
import { Button } from '@/components/ui/button'

// Extender el tipo del router context
declare module '@tanstack/react-router' {
  interface RouterContext {
    queryClient?: QueryClient
  }
}

// Query options para notas
// getNotes es una Server Function, TanStack Start la maneja automáticamente
const notesQueryOptions = queryOptions({
  queryKey: ['notes'],
  queryFn: () => getNotes(),
})

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    // Pre-popular Query cache para SSR
    const notes = await getNotes()
    // El queryClient está disponible en el context cuando se configura en el router
    const queryClient = 'queryClient' in context ? (context as { queryClient: QueryClient }).queryClient : undefined
    if (queryClient) {
      queryClient.setQueryData(notesQueryOptions.queryKey, notes)
    }
    return { notes }
  },
  component: App,
})

function App() {
  const [isModalOpen, setModalOpen] = useState(false)
  const queryClient = useQueryClient()
  const { notes: loaderNotes } = Route.useLoaderData()

  // Fuente única de verdad: TanStack Query cache
  const { data: notes = loaderNotes } = useQuery({
    ...notesQueryOptions,
    initialData: loaderNotes, // SSR: usar datos del loader
  })

  // Server function hook para crear notas
  const createNoteFn = useServerFn(createNote)

  // Mutation para crear notas con actualización optimista automática
  const createNoteMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      return createNoteFn({ data })
    },
    onMutate: async (newNoteData) => {
      // Cancelar queries en curso para evitar sobrescribir nuestra actualización optimista
      await queryClient.cancelQueries({ queryKey: notesQueryOptions.queryKey })

      // Snapshot del valor anterior
      const previousNotes = queryClient.getQueryData<Note[]>(notesQueryOptions.queryKey) ?? []

      // Crear nota optimista temporal
      const optimisticNote: Note = {
        id: crypto.randomUUID(), // ID temporal
        title: newNoteData.title,
        content: newNoteData.content,
        createdAt: new Date(),
      }

      // Actualización optimista: agregar la nota inmediatamente
      queryClient.setQueryData<Note[]>(notesQueryOptions.queryKey, (old = []) => [
        optimisticNote,
        ...old,
      ])

      // Retornar contexto para rollback en caso de error
      return { previousNotes, optimisticNote }
    },
    onError: (err, _newNoteData, context) => {
      // Revertir en caso de error
      if (context?.previousNotes) {
        queryClient.setQueryData(notesQueryOptions.queryKey, context.previousNotes)
      }
      const errorMessage =
        err instanceof Error ? err.message : 'Error al crear la nota'
      toast.error(errorMessage)
    },
    onSuccess: (data, _variables, context) => {
      // Reemplazar la nota optimista con la real del servidor
      queryClient.setQueryData<Note[]>(notesQueryOptions.queryKey, (old = []) =>
        old.map((note) =>
          note.id === context?.optimisticNote.id ? data : note
        )
      )
      setModalOpen(false)
      toast.success('Nota creada exitosamente')
    },
  })

  // Función para guardar una nueva nota
  const handleSaveNote = async (data: { title: string; content: string }) => {
    try {
      await createNoteMutation.mutateAsync(data)
    } catch (error) {
      // El error ya se maneja en onError, solo re-lanzar para que el modal no se cierre
      throw error
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">QuickNotes</h1>
        <Button onClick={() => setModalOpen(true)}>Nueva Nota</Button>
      </div>

      <CreateNoteModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveNote}
      />

      <NoteTable notes={notes} />
    </div>
  )
}
