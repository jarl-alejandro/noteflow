import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getNoteById, deleteNote } from "@/server/functions";
import { Button } from "@/components/ui/button";
import type { Note } from "@/types/note";

export const Route = createFileRoute("/notes/$id")({
	loader: async ({ params }) => {
		const note = await getNoteById({ data: { id: params.id } });
		return { note };
	},
	component: NoteDetail,
});

function NoteDetail() {
	const { note } = Route.useLoaderData();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Mutation para delete con optimistic update
	const deleteNoteMutation = useMutation({
		mutationFn: () => deleteNote({ data: { id: note.id } }),
		onMutate: async () => {
			// Optimistic: Remover de cache de notes con tipos proper
			await queryClient.cancelQueries({ queryKey: ["notes"] });

			type InfiniteData = {
				pages: Note[][];
				pageParams: (string | undefined)[];
			};

			const previousData = queryClient.getQueryData<InfiniteData>(["notes"]);
			queryClient.setQueryData<InfiniteData>(["notes"], (old) => {
				if (!old) return old;

				return {
					...old,
					pages: old.pages.map((page) =>
						page.filter((n: Note) => n.id !== note.id),
					),
				};
			});
			return { previousData };
		},
		onError: (err, _, context) => {
			queryClient.setQueryData(["notes"], context?.previousData);
			const errorMessage =
				err instanceof Error ? err.message : "Error al eliminar la nota";
			toast.error(errorMessage);
		},
		onSuccess: () => {
			toast.success("Nota eliminada exitosamente");
			navigate({ to: "/" });
		},
	});

	// Función para formatear la fecha
	const formatDate = (date: Date) => {
		return new Date(date).toLocaleDateString("es-ES", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	// Función para eliminar la nota
	const handleDelete = async () => {
		if (!confirm("¿Estás seguro de que deseas eliminar esta nota?")) {
			return;
		}
		deleteNoteMutation.mutate();
	};

	return (
		<div className="container mx-auto py-8 px-4 max-w-4xl">
			<div className="mb-6">
				<Button variant="outline" onClick={() => navigate({ to: "/" })}>
					← Volver
				</Button>
			</div>

			<article className="bg-card rounded-lg border p-6 shadow-sm">
				<div className="flex justify-between items-start mb-4">
					<h1 className="text-3xl font-bold">{note.title}</h1>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={deleteNoteMutation.isPending}
					>
						{deleteNoteMutation.isPending ? "Eliminando..." : "Eliminar"}
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
	);
}
