import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutos - datos frescos sin refetch
        gcTime: 1000 * 60 * 10, // 10 minutos - tiempo en cache
        refetchOnWindowFocus: false, // No refetch automático al cambiar de ventana
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  // Configurar integración SSR con TanStack Query
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })

  return router
}
