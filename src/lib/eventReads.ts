import { getEventsFactory } from '@/services/events'
import type { EventsInterface } from '@/services/depositLookup'

import { withRpcReadRetry } from './rpcSelect'

// EventService instances keep the RPC URL they were constructed with. Recreate the factory on the
// single retry so a rotated endpoint is actually used; callers pass only read-only event work.
export const withEventReadRetry = <T>(
  netId: number,
  read: (eventsInterface: EventsInterface) => Promise<T>
): Promise<T> => withRpcReadRetry(netId, (rpcUrl) => read(getEventsFactory(rpcUrl)))

export const getRetryingEventService = (
  netId: number,
  params: { netId: string | number; amount: string | number; currency: string }
) => ({
  findEvent: (findParams: { eventName: string; eventToFind: string; type: string }) =>
    withEventReadRetry(netId, (eventsInterface) =>
      eventsInterface.getService(params).findEvent(findParams)
    ),
  updateEvents: (type: string) =>
    withEventReadRetry(netId, (eventsInterface) =>
      eventsInterface.getService(params).updateEvents(type)
    )
})
