// Este archivo solo exporta las server functions para uso en el cliente
// Las funciones reales se importan dinámicamente usando @vite-ignore para evitar análisis estático
import { createServerFn } from '@tanstack/react-start'

// Server function para obtener notas (cliente)
export const getNotesClient = createServerFn().handler(async () => {
  // @vite-ignore previene que Vite analice esta importación en el cliente
  const { getNotes } = await import(/* @vite-ignore */ './functions')
  return getNotes()
}) as any

// Server function para crear nota (cliente)
export const createNote = createServerFn().handler(async (ctx) => {
  // @vite-ignore previene que Vite analice esta importación en el cliente
  const { createNote: _createNote } = await import(/* @vite-ignore */ './functions')
  const data = (ctx as any).data as { title: string; content: string }
  return _createNote(data)
}) as any

// Server function para eliminar nota (cliente)
export const deleteNote = createServerFn().handler(async (ctx) => {
  // @vite-ignore previene que Vite analice esta importación en el cliente
  const { deleteNote: _deleteNote } = await import(/* @vite-ignore */ './functions')
  const id = (ctx as any).data as string
  return _deleteNote(id)
}) as any

