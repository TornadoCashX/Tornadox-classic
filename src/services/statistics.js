// Framework-independent helper for building the "latest deposits" list shown in Statistics.tsx.
const LATEST_DEPOSITS_LIMIT = 10

export const buildLatestDepositsFromEvents = ({ events = [], formatTimeAgo }) => {
  const sortedEvents = [...events].sort((a, b) => a.leafIndex - b.leafIndex)
  const latestDeposits = []

  for (const event of sortedEvents.slice(-LATEST_DEPOSITS_LIMIT)) {
    latestDeposits.unshift({
      index: event.leafIndex,
      depositTime: formatTimeAgo(event.timestamp)
    })
  }

  return latestDeposits
}

// Mirrors the same-named helper in classic's services/statistics.js: pairs each Multicall
// aggregate() returnData entry back to the pool (currency/amount) it was requested for, decoding
// the raw bytes via the caller-supplied decodeParameter (web3.eth.abi.decodeParameter('uint256', ...)).
export const decodeMulticallNextIndexResults = ({ returnData, pools, decodeParameter }) => {
  return returnData.map((data, index) => {
    const nextDepositIndex = decodeParameter('uint256', data)
    const { amount, currency } = pools[index]

    return { amount, currency, nextDepositIndex }
  })
}
