import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { createRelayerWithdrawRequestDTO } from '@/services/protocolDto'
import { pollRelayerJobUntilTerminal, submitTornadoWithdraw } from '@/services/relayerClient'

// Ports store/relayer.js's job map (state.jobs) + components/Job.vue: classic keeps in-flight
// relayer withdrawals in the Vuex store precisely so Txs.vue can render a live status row for
// them regardless of which tab/page is currently mounted - a relayer job started from the
// Withdraw tab still has to show up in the Transactions list if the user switches to Deposit
// while it's confirming. Hook-local state can't do that: it dies the moment WithdrawTab unmounts.
// This context is that same submit/track/poll logic, just lifted to survive tab switches, same as
// Notice/Loading.
//
// Holds a list rather than a single job, matching classic's jobs map: a second withdrawal
// submitted while one is still confirming used to overwrite the first one's entry outright,
// silently dropping its status row and its stale-timeout. Each job is keyed by an internal uid
// (assigned at submit time) rather than by the relayer's job id, because a job exists - and is
// already rendered - during the 'submitting' window before any id has come back.
const STALE_JOB_TIMEOUT_MS = 15 * 60 * 1000
const RELAYER_JOBS_STORAGE_KEY = 'tornado-relayer-jobs'

export type RelayerJobStatus = 'idle' | 'submitting' | 'PENDING' | 'CONFIRMED' | 'FAILED' | string

export interface RelayerJobState {
  uid: string
  id: string | null
  status: RelayerJobStatus
  relayerUrl: string | null
  txHash: string | null
  confirmations: number
  failedReason: string | null
  amount: string | number | null
  currency: string | null
  timestamp: number | null
  netId: number
}

const newJob = (uid: string, netId: number): RelayerJobState => ({
  uid,
  id: null,
  status: 'submitting',
  relayerUrl: null,
  txHash: null,
  confirmations: 0,
  failedReason: null,
  amount: null,
  currency: null,
  timestamp: null,
  netId
})

const readPersistedJobs = (): RelayerJobState[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(RELAYER_JOBS_STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter(
          (job) =>
            job &&
            typeof job.uid === 'string' &&
            typeof job.id === 'string' &&
            Boolean(job.id) &&
            typeof job.netId === 'number'
        )
      : []
  } catch {
    return []
  }
}

const persistJobs = (jobs: RelayerJobState[]) => {
  try {
    window.localStorage.setItem(RELAYER_JOBS_STORAGE_KEY, JSON.stringify(jobs))
  } catch (error) {
    console.error('Unable to persist relayer jobs', error)
  }
}

interface RelayerJobContextValue {
  jobs: RelayerJobState[]
  submit: (params: {
    relayerUrl: string
    args: string[]
    proof: string
    contract: string
    amount: string | number
    currency: string
    netId: number
  }) => Promise<string>
  trackInBackground: (
    id: string,
    callbacks: { onConfirmed?: (jobStatus: { txHash: string }) => void; onFailed?: (error: unknown) => void }
  ) => void
  clearJob: (uid: string) => void
}

const RelayerJobContext = createContext<RelayerJobContextValue | null>(null)

export const RelayerJobProvider = ({ children }: { children: ReactNode }) => {
  const [jobs, setJobs] = useState<RelayerJobState[]>(readPersistedJobs)
  const jobsRef = useRef<RelayerJobState[]>(jobs)
  const staleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const trackedIdsRef = useRef(new Set<string>())
  const uidCounter = useRef(0)

  // Same reasoning as the hook this replaces: pollRelayerJobUntilTerminal's first tick runs
  // synchronously, before React would have re-rendered and updated jobsRef.current via a plain
  // `jobsRef.current = jobs` assignment - so every update is routed through here instead,
  // keeping jobsRef.current authoritative immediately rather than only after the next render.
  const applyJobs = (updater: (prev: RelayerJobState[]) => RelayerJobState[]) => {
    const next = updater(jobsRef.current)
    jobsRef.current = next
    persistJobs(next)
    setJobs(next)
  }

  const patchByUid = (uid: string, patch: Partial<RelayerJobState>) =>
    applyJobs((prev) => prev.map((job) => (job.uid === uid ? { ...job, ...patch } : job)))

  const patchById = (id: string, patch: Partial<RelayerJobState>) =>
    applyJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)))

  const removeByUid = (uid: string) => applyJobs((prev) => prev.filter((job) => job.uid !== uid))

  const clearStaleTimer = (uid: string) => {
    const timer = staleTimersRef.current.get(uid)
    if (timer) clearTimeout(timer)
    staleTimersRef.current.delete(uid)
  }

  const scheduleStaleTimer = (uid: string) => {
    if (staleTimersRef.current.has(uid)) return
    staleTimersRef.current.set(
      uid,
      setTimeout(() => {
        patchByUid(uid, { status: 'FAILED', failedReason: 'relayerIsNotResponding' })
      }, STALE_JOB_TIMEOUT_MS)
    )
  }

  const submit = async ({
    relayerUrl,
    args,
    proof,
    contract,
    amount,
    currency,
    netId
  }: {
    relayerUrl: string
    args: string[]
    proof: string
    contract: string
    amount: string | number
    currency: string
    netId: number
  }): Promise<string> => {
    const uid = `relayer-job-${Date.now()}-${++uidCounter.current}`
    applyJobs((prev) => [
      ...prev,
      { ...newJob(uid, netId), amount, currency, timestamp: Math.round(Date.now() / 1000) }
    ])

    const message = createRelayerWithdrawRequestDTO({ args, proof, contract })

    let id: string
    try {
      id = await submitTornadoWithdraw({ relayerUrl, message })
    } catch (error) {
      // Drop the placeholder rather than leaving it stuck on 'submitting' forever: JobRow only
      // offers its remove button once a job is FAILED, so a never-submitted job would otherwise
      // sit in the Transactions list permanently with no way for the user to dismiss it. The
      // caller (WithdrawTab) surfaces the failure itself, so nothing is lost by removing it here.
      removeByUid(uid)
      throw error
    }

    patchByUid(uid, { id, status: 'PENDING', relayerUrl, txHash: null, confirmations: 0, failedReason: null })

    return id
  }

  const trackInBackground = (
    id: string,
    { onConfirmed, onFailed }: { onConfirmed?: (jobStatus: { txHash: string }) => void; onFailed?: (error: unknown) => void }
  ) => {
    const tracked = jobsRef.current.find((job) => job.id === id)
    if (!tracked) return
    const { uid } = tracked
    scheduleStaleTimer(uid)
    if (trackedIdsRef.current.has(id)) return
    trackedIdsRef.current.add(id)

    pollRelayerJobUntilTerminal({
      id,
      getJob: () => jobsRef.current.find((job) => job.id === id) ?? null,
      onUpdate: (update) => {
        patchById(id, {
          txHash: update.txHash,
          confirmations: update.confirmations,
          status: update.status,
          failedReason: update.failedReason
        })
      }
    })
      .then((jobStatus) => {
        clearStaleTimer(uid)
        onConfirmed?.(jobStatus)
        // Mirrors runJobWatcherWithNotifications's try-branch: dispatch('deleteJob', ...) right
        // after a successful runJobWatcher - the settled withdrawal now lives in the regular
        // Transactions list (via recordWithdrawal, called from the onConfirmed callback above),
        // so this temporary job row's job is done.
        if (onConfirmed) {
          removeByUid(uid)
        } else {
          // Restored jobs no longer have the original Note callback needed to rebuild the local
          // transaction record. Keep a terminal, removable row so confirmation is still visible.
          patchByUid(uid, { status: 'CONFIRMED', txHash: jobStatus.txHash })
        }
      })
      .catch((error) => {
        clearStaleTimer(uid)
        patchByUid(uid, { status: 'FAILED', failedReason: (error as Error)?.message || 'relayerError' })
        onFailed?.(error)
      })
      .finally(() => trackedIdsRef.current.delete(id))
  }

  useEffect(() => {
    jobsRef.current
      .filter((job) => job.id && job.status !== 'CONFIRMED' && job.status !== 'FAILED')
      .forEach((job) => trackInBackground(job.id as string, {}))

    return () => {
      staleTimersRef.current.forEach(clearTimeout)
      staleTimersRef.current.clear()
    }
    // Restored jobs are resumed exactly once when the provider mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirrors Job.vue's onDelete (only enabled once isFailed) - manually dismisses a failed job
  // row. A successful one clears itself automatically above.
  const clearJob = (uid: string) => {
    clearStaleTimer(uid)
    removeByUid(uid)
  }

  return (
    <RelayerJobContext.Provider value={{ jobs, submit, trackInBackground, clearJob }}>
      {children}
    </RelayerJobContext.Provider>
  )
}

export const useRelayerJob = () => {
  const ctx = useContext(RelayerJobContext)
  if (!ctx) throw new Error('useRelayerJob must be used within a RelayerJobProvider')
  return ctx
}
