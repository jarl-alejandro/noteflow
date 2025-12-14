import { Link } from '@tanstack/react-router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { Note } from '@/server/functions'

interface NoteTableProps {
  notes: Note[]
}

export function NoteTable({ notes }: NoteTableProps) {
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

  // Función para obtener preview del contenido
  const getContentPreview = (content: string, maxLength: number = 50) => {
    if (content.length <= maxLength) {
      return content
    }
    return content.substring(0, maxLength) + '...'
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay notas disponibles. Crea tu primera nota haciendo clic en "Nueva Nota".
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Contenido (Preview)</TableHead>
            <TableHead>Fecha de Creación</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notes.map((note) => (
            <TableRow key={note.id}>
              <TableCell className="font-medium">{note.title}</TableCell>
              <TableCell className="text-muted-foreground">
                {getContentPreview(note.content)}
              </TableCell>
              <TableCell>{formatDate(note.createdAt)}</TableCell>
              <TableCell className="text-right">
                <Link to="/notes/$id" params={{ id: note.id }}>
                  <Button variant="outline" size="sm">
                    Ver Detalle
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

