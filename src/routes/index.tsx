import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { toast } from 'sonner'
import { getNotes, createNote } from '@/server/functions'
import type { Note } from '@/types/note'
import { NoteTable } from '@/components/NoteTable'
import { CreateNoteModal } from '@/components/CreateNoteModal'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  loader: async () => {
    // Cargar las notas desde el servidor
    const notes = await getNotes()
    return { notes }
  },
  component: App,
})

function App() {
  const { notes: initialNotes } = Route.useLoaderData()
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [isModalOpen, setModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  console.log('initialNotes', initialNotes);

  // Server functions hooks
  const getNotesFn = useServerFn(getNotes as any)
  const createNoteFn = useServerFn(createNote as any)

  // Función para recargar las notas
  const reloadNotes = async () => {
    setIsLoading(true)
    try {
      const updatedNotes = await getNotesFn()
      setNotes(updatedNotes)
    } catch (error) {
      toast.error('Error al cargar las notas')
      console.error('Error al cargar notas:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Función para guardar una nueva nota
  const handleSaveNote = async (data: { title: string; content: string }) => {
    try {
      await createNoteFn(data)
      toast.success('Nota creada exitosamente')
      await reloadNotes()
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error al crear la nota'
      toast.error(errorMessage)
      throw error // Re-lanzar para que el modal no se cierre
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">QuickNotes</h1>
        <Button onClick={() => {
          console.log('open');
          setModalOpen(true)
        }}>Nueva Nota</Button>
      </div>

      <CreateNoteModal
        isOpen={isModalOpen}
        onClose={() => {
          console.log('close');
          setModalOpen(false);
        }}
        onSave={handleSaveNote}
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Cargando notas...
        </div>
      ) : (
        <NoteTable notes={notes} />
      )}
    </div>
  )
}
