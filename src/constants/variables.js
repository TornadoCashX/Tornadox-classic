const DEPOSIT = 'deposit'
const WITHDRAWAL = 'withdrawal'

export const eventsType = {
  DEPOSIT,
  WITHDRAWAL
}

export const CONTRACT_INSTANCES = ['0.1', '1', '10', '100', '1000']

export const addressType = { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' }

export const httpConfig = {
  // buffer for tor connections
  timeout: 30000,
  keepAlive: true
}

export const trees = {
  PARTS_COUNT: 4,
  LEVELS: 20 // const from contract
}
