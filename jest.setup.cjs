const { TextDecoder, TextEncoder } = require('util')
const { webcrypto } = require('crypto')

global.TextDecoder = TextDecoder
global.TextEncoder = TextEncoder
Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto })
