import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { toast } from 'sonner'
import { deleteNote } from '@/server/client-functions'
import { Button } from '@/components/ui/button'

// Importar getNoteById solo en el loader (servidor)
async function loadNote(id: string) {
  const { getNoteById } = await import('@/server/functions')
  return getNoteById(id)
}

export const Route = createFileRoute('/notes/$id')({
  loader: async ({ params }) => {
    const note = await loadNote(params.id)
    if (!note) {
      throw new Error('Nota no encontrada')
    }
    return { note }
  },
  component: NoteDetail,
})

function NoteDetail() {
  const { note } = Route.useLoaderData()
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)

  // Server function hook
  const deleteNoteFn = useServerFn(deleteNote as any)

  // Función para formatear la fecha
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Función para eliminar la nota
  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta nota?')) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteNoteFn(note.id)
      toast.success('Nota eliminada exitosamente')
      navigate({ to: '/' })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error al eliminar la nota'
      toast.error(errorMessage)
      console.error('Error al eliminar nota:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Button variant="outline" onClick={() => navigate({ to: '/' })}>
          ← Volver
        </Button>
      </div>

      <article className="bg-card rounded-lg border p-6 shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-3xl font-bold">{note.title}</h1>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Creada el {formatDate(note.createdAt)}
          </p>
        </div>

        <div className="prose max-w-none">
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {note.content}
          </p>
        </div>
      </article>
    </div>
  )
}
