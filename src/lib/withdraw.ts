import { withEventReadRetry } from '@/lib/eventReads'
import { treesInterface } from '@/services/merkleTree'
import { syncEvents } from '@/services/eventLoader'
import { eventsType } from '@/constants'
import { checkCommitments, toFixedHex } from '@/utils'

import { isKnownRoot } from './contracts'

const hasCommitment = (events: Array<{ commitment?: unknown }>, commitmentHex: string) =>
  events.some((event) => String(event.commitment).toLowerCase() === commitmentHex.toLowerCase())

// Ports store/application.js's buildTree/checkRoot Vuex actions into a plain async function.
export const buildTree = async ({
  netId,
  currency,
  amount,
  commitmentHex,
  // Injected rather than looked up here so this stays framework/i18n-independent, matching how
  // services/withdrawFlow.js already takes spentMessage/missingDepositMessage.
  invalidRootMessage = 'Invalid Root',
  missingEventsMessage = 'failedToFetchAllDepositEvents'
}: {
  netId: number
  currency: string
  amount: string | number
  commitmentHex: string
  invalidRootMessage?: string
  missingEventsMessage?: string
}) => {
  return withEventReadRetry(netId, async (eventsInterface) => {
    const treeInstanceName = `${netId}_${currency}_${amount}`
    const params = { netId, amount, currency }
    const eventService = eventsInterface.getService(params)
    const treeService = treesInterface.getService({
      ...params,
      commitment: commitmentHex,
      instanceName: treeInstanceName
    })

    const [cachedTree, eventsData] = await Promise.all([
      treeService.getTree({ commitment: commitmentHex }),
      syncEvents({ eventsInterface, payload: { ...params, type: eventsType.DEPOSIT } })
    ])
    let depositEvents = eventsData.events

    if (!hasCommitment(depositEvents, commitmentHex)) {
      const depositEvent = await eventService.findEvent({
        eventName: 'commitment',
        eventToFind: commitmentHex,
        type: eventsType.DEPOSIT
      })
      if (depositEvent) {
        depositEvents = depositEvents.concat(depositEvent).sort((a: any, b: any) => a.leafIndex - b.leafIndex)
      }
    }

    checkCommitments(depositEvents, missingEventsMessage)
    const commitments = depositEvents.map((el: any) => el.commitment.toString(10))

    let tree = cachedTree
    if (tree) {
      tree.bulkInsert(commitments.slice(tree.elements.length))
    } else {
      tree = treeService.createTree({ events: commitments })
    }

    const root = toFixedHex(tree.root)
    if (!(await isKnownRoot(netId, currency, amount, root))) {
      throw new Error(invalidRootMessage)
    }

    await treeService.saveTree({ tree })
    return { tree, root }
  })
}
