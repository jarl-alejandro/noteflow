export function NoteSkeleton() {
	return (
		<div className="bg-card rounded-lg border p-6 shadow-sm space-y-4">
			<div className="flex justify-between items-start">
				<div className="space-y-2 flex-1">
					<div className="h-6 bg-muted rounded w-3/4 animate-pulse" />
					<div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
				</div>
				<div className="h-8 bg-muted rounded w-20 animate-pulse" />
			</div>
			<div className="space-y-2">
				<div className="h-4 bg-muted rounded w-full animate-pulse" />
				<div className="h-4 bg-muted rounded w-full animate-pulse" />
				<div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
			</div>
		</div>
	);
}

export function NoteTableSkeleton({ count = 5 }: { count?: number }) {
	return (
		<div className="space-y-4">
			{Array.from({ length: count }, () => (
				<NoteSkeleton key={Math.random().toString(36).substr(2, 9)} />
			))}
		</div>
	);
}
