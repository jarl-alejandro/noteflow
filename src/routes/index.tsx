import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { getNotes, createNote, type Note } from '@/server/functions'
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

  // Función para recargar las notas
  const reloadNotes = async () => {
    setIsLoading(true)
    try {
      const updatedNotes = await getNotes()
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
      await createNote(data)
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
        <Button onClick={() => setModalOpen(true)}>Nueva Nota</Button>
      </div>

      <CreateNoteModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
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
