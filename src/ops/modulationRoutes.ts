import type { ModulationDestination, ModulationRoute, ModulationSource } from '../patch/types'

export function findRoute(routes: readonly ModulationRoute[], source: ModulationSource, destination: ModulationDestination): ModulationRoute | undefined {
  return routes.find((route) => route.source === source && route.destination === destination)
}

export function removeRoute(routes: readonly ModulationRoute[], source: ModulationSource, destination: ModulationDestination): ModulationRoute[] {
  return routes.filter((route) => route.source !== source || route.destination !== destination)
}

function routeId(routes: readonly ModulationRoute[], source: ModulationSource, destination: ModulationDestination): string {
  const base = `${source}-${destination.replaceAll('.', '-')}`
  const ids = new Set(routes.map((route) => route.id))
  if (!ids.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    if (!ids.has(`${base}-${suffix}`)) return `${base}-${suffix}`
  }
}

export function upsertRoute(
  routes: readonly ModulationRoute[],
  route: Omit<ModulationRoute, 'id'>,
): ModulationRoute[] {
  const existing = findRoute(routes, route.source, route.destination)
  if (existing) {
    return routes.map((item) => item.id === existing.id ? { ...item, ...route } : item)
  }
  if (routes.length >= 16) throw new RangeError('A patch cannot contain more than 16 modulation routes')
  return [...routes, { id: routeId(routes, route.source, route.destination), ...route }]
}
