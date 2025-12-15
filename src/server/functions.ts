import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { eq, desc, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notes } from "@/db/schema";
import type { Note } from "@/types/note";

// Re-exportar el tipo para compatibilidad
export type { Note };

// Schemas de validación con Zod
const NoteIdSchema = z.object({
	id: z.string().uuid("El ID debe ser un UUID válido"),
});

const GetNotesSchema = z.object({
	cursor: z.string().datetime().optional(),
	limit: z.number().min(1).max(100).default(20),
});

const CreateNoteSchema = z.object({
	title: z
		.string()
		.min(1, "El título es requerido")
		.max(255, "El título no puede exceder 255 caracteres"),
	content: z.string().min(1, "El contenido es requerido"),
});

// Tipos inferidos de los schemas
type NoteIdInput = z.infer<typeof NoteIdSchema>;
type GetNotesInput = z.infer<typeof GetNotesSchema>;
type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

// Server Function para obtener notas con paginación
// OPTIMIZADO: Eliminado streaming mal implementado, mejor usar compresión HTTP
export const getNotes = createServerFn()
	.inputValidator(GetNotesSchema)
	.handler(async ({ data }: { data: GetNotesInput }) => {
		// NOTA: Los cache headers se configuran a nivel de deployment (Vercel/Netlify)
		// Las server functions de TanStack Start no tienen acceso directo a response headers

		const query = db
			.select()
			.from(notes)
			.where(
				data.cursor ? lt(notes.createdAt, new Date(data.cursor)) : undefined,
			)
			.orderBy(desc(notes.createdAt))
			.limit(data.limit);

		const allNotes = await query;

		// Mapear a formato de respuesta (solo campos necesarios)
		const notesData: Note[] = allNotes.map((note) => ({
			id: note.id,
			title: note.title,
			content: note.content,
			createdAt: note.createdAt,
		}));

		return notesData;
	});

// Server Function para obtener una nota por ID
export const getNoteById = createServerFn()
	.inputValidator(NoteIdSchema)
	.handler(async ({ data }: { data: NoteIdInput }) => {
		const [note] = await db.select().from(notes).where(eq(notes.id, data.id));

		if (!note) {
			throw notFound();
		}

		return {
			id: note.id,
			title: note.title,
			content: note.content,
			createdAt: note.createdAt,
		};
	});

// Server Function para crear una nota
export const createNote = createServerFn({ method: "POST" })
	.inputValidator(CreateNoteSchema)
	.handler(async ({ data }: { data: CreateNoteInput }) => {
		const [newNote] = await db
			.insert(notes)
			.values({
				title: data.title.trim(),
				content: data.content.trim(),
			})
			.returning();

		return {
			id: newNote.id,
			title: newNote.title,
			content: newNote.content,
			createdAt: newNote.createdAt,
		};
	});

// Server Function para eliminar una nota
export const deleteNote = createServerFn({ method: "POST" })
	.inputValidator(NoteIdSchema)
	.handler(async ({ data }: { data: NoteIdInput }) => {
		const [deletedNote] = await db
			.delete(notes)
			.where(eq(notes.id, data.id))
			.returning();

		if (!deletedNote) {
			throw notFound();
		}

		return { success: true };
	});
