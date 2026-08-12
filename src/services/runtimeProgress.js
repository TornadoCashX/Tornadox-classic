let eventProgressReporter = () => {}

export const configureRuntimeProgress = ({ reportEventProgress }) => {
  if (typeof reportEventProgress !== 'function') {
    throw new TypeError('reportEventProgress adapter must be a function')
  }
  eventProgressReporter = reportEventProgress
}

export const reportEventProgress = (payload) => eventProgressReporter(payload)
