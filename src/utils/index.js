import { saveAs } from 'file-saver'

export * from './crypto'
export * from './adapters'
export * from './stringUtils'
export * from './instanceUtils'

export function flattenNArray(arr) {
  return arr.flat(Infinity)
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function detectMob() {
  if (
    navigator.userAgent.match(/Android/i) ||
    navigator.userAgent.match(/webOS/i) ||
    navigator.userAgent.match(/iPhone/i) ||
    navigator.userAgent.match(/iPad/i) ||
    navigator.userAgent.match(/iPod/i) ||
    navigator.userAgent.match(/BlackBerry/i) ||
    navigator.userAgent.match(/Windows Phone/i)
  ) {
    return true
  } else {
    return false
  }
}

export function saveAsFile(data, name) {
  saveAs(data, name)
}

/**
 * Writes a deposit note out as the `backup-<prefix>-<first 10 chars>.txt` file classic produces
 * (store/application.js's prepareDeposit and DepositModalBox.vue's own Save button both build
 * this same blob and filename). Shared so the automatic post-deposit backup and the modal's
 * manual Save button can't drift apart in naming or content.
 *
 * @param {string} prefix note prefix, `tornado-<currency>-<amount>-<netId>`
 * @param {string} note the note body
 */
export function saveNoteBackupFile(prefix, note) {
  const data = new Blob([`${prefix}-${note}`], { type: 'text/plain;charset=utf-8' })
  saveAsFile(data, `backup-${prefix}-${note.slice(0, 10)}.txt`)
}
