import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
	infiniteQueryOptions,
	type QueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getNotes, createNote } from "@/server/functions";
import type { Note } from "@/types/note";
import { NoteTable } from "@/components/NoteTable";
import { CreateNoteModal } from "@/components/CreateNoteModal";
import { NoteTableSkeleton } from "@/components/NoteSkeleton";
import { Button } from "@/components/ui/button";
import { PAGINATION, CACHE, RETRY } from "@/config/constants";

// Extender el tipo del router context
declare module "@tanstack/react-router" {
	interface RouterContext {
		queryClient?: QueryClient;
	}
}

// Query options para notas con paginación infinita
const notesQueryOptions = infiniteQueryOptions({
	queryKey: ["notes"],
	queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
		const notes = await getNotes({
			data: { cursor: pageParam, limit: PAGINATION.DEFAULT_LIMIT },
		});
		return notes;
	},
	initialPageParam: undefined as string | undefined,
	getNextPageParam: (lastPage: Note[]) =>
		lastPage.length === PAGINATION.DEFAULT_LIMIT
			? lastPage[lastPage.length - 1].createdAt.toISOString()
			: undefined,
	staleTime: CACHE.STALE_TIME,
	gcTime: CACHE.GC_TIME,
	retry: RETRY.ATTEMPTS,
	retryDelay: (attemptIndex) =>
		Math.min(RETRY.DELAY_BASE * 2 ** attemptIndex, RETRY.MAX_DELAY),
});

export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		// Pre-popular Query cache para SSR con primera página
		const notes = await getNotes({ data: { limit: 10 } });
		const queryClient =
			"queryClient" in context
				? (context as { queryClient: QueryClient }).queryClient
				: undefined;
		if (queryClient) {
			queryClient.setQueryData(notesQueryOptions.queryKey, {
				pages: [notes],
				pageParams: [undefined],
			});
		}
		return { notes };
	},
	component: App,
});

function App() {
	const [isModalOpen, setModalOpen] = useState(false);
	const queryClient = useQueryClient();
	const { notes: loaderNotes } = Route.useLoaderData();

	// Usar infinite query para paginación
	const {
		data: notesPages,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
	} = useInfiniteQuery({
		...notesQueryOptions,
		initialData: { pages: [loaderNotes], pageParams: [undefined] },
	});

	const notes = notesPages?.pages.flat() ?? [];

	// Server function hook para crear notas
	const createNoteFn = useServerFn(createNote);

	// Mutation simplificada sin timeout manual
	// TanStack Query maneja timeouts y retries automáticamente
	const createNoteMutation = useMutation({
		mutationFn: async (data: { title: string; content: string }) => {
			return createNoteFn({ data });
		},
		onMutate: async (newNoteData: { title: string; content: string }) => {
			// Cancelar queries para evitar race conditions
			await queryClient.cancelQueries({ queryKey: notesQueryOptions.queryKey });

			// Snapshot del estado anterior con tipado correcto
			type InfiniteData = {
				pages: Note[][];
				pageParams: (string | undefined)[];
			};
			const previousData = queryClient.getQueryData<InfiniteData>(
				notesQueryOptions.queryKey,
			);

			// Crear nota optimista
			const optimisticNote: Note = {
				id: crypto.randomUUID(),
				title: newNoteData.title,
				content: newNoteData.content,
				createdAt: new Date(),
			};

			// Actualización optimista: Manejar page boundaries correctamente
			queryClient.setQueryData<InfiniteData>(
				notesQueryOptions.queryKey,
				(old) => {
					if (!old) {
						return { pages: [[optimisticNote]], pageParams: [undefined] };
					}

					const firstPage = old.pages[0] || [];
					const updatedFirstPage = [optimisticNote, ...firstPage];

					// Si la primera página excede el límite, mover el último elemento a la segunda página
					if (updatedFirstPage.length > PAGINATION.DEFAULT_LIMIT) {
						const lastItem = updatedFirstPage.pop();
						if (lastItem) {
							const secondPage = old.pages[1] || [];

							return {
								...old,
								pages: [
									updatedFirstPage,
									[lastItem, ...secondPage],
									...old.pages.slice(2),
								],
							};
						}
					}

					return {
						...old,
						pages: [updatedFirstPage, ...old.pages.slice(1)],
					};
				},
			);

			return { previousData, optimisticNote };
		},
		onError: (err: Error, _newNoteData, context) => {
			// Rollback preciso con tipado
			if (context?.previousData) {
				queryClient.setQueryData(
					notesQueryOptions.queryKey,
					context.previousData,
				);
			}
			const errorMessage =
				err instanceof Error ? err.message : "Error al crear la nota";
			toast.error(errorMessage);
		},
		onSuccess: (data: Note, _variables, context) => {
			// Reemplazar optimista con real, manteniendo orden y consistencia
			type InfiniteData = {
				pages: Note[][];
				pageParams: (string | undefined)[];
			};
			queryClient.setQueryData<InfiniteData>(
				notesQueryOptions.queryKey,
				(old) => {
					if (!old || !context?.optimisticNote) return old;

					return {
						...old,
						pages: old.pages.map((page) =>
							page.map((note) =>
								note.id === context.optimisticNote.id
									? { ...data, createdAt: note.createdAt } // Mantener timestamp optimista para consistencia
									: note,
							),
						),
					};
				},
			);
			setModalOpen(false);
			toast.success("Nota creada exitosamente");
		},
		// Configuración de retry para producción
		retry: RETRY.ATTEMPTS,
		retryDelay: (attemptIndex) =>
			Math.min(RETRY.DELAY_BASE * 2 ** attemptIndex, RETRY.MAX_DELAY),
	});

	// Función para guardar una nueva nota
	const handleSaveNote = async (data: { title: string; content: string }) => {
		await createNoteMutation.mutateAsync(data);
	};

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
				<NoteTableSkeleton count={5} />
			) : (
				<NoteTable notes={notes} />
			)}

			{hasNextPage && (
				<div className="flex justify-center mt-6">
					<Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
						{isFetchingNextPage ? "Cargando..." : "Cargar más notas"}
					</Button>
				</div>
			)}
		</div>
	);
}
