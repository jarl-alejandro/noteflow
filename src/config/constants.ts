// Configuration constants for the application
export const PAGINATION = {
	DEFAULT_LIMIT: 20,
	MAX_LIMIT: 100,
} as const;

export const CACHE = {
	STALE_TIME: 5 * 60 * 1000, // 5 minutes
	GC_TIME: 10 * 60 * 1000, // 10 minutes
} as const;

export const RETRY = {
	ATTEMPTS: 3,
	DELAY_BASE: 1000,
	MAX_DELAY: 30000,
} as const;
