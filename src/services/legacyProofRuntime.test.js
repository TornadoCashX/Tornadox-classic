const { createLegacyProofRuntime } = require('./legacyProofRuntime')

describe('legacy proof worker boundary', () => {
  it('serializes BigInt input, transfers assets once and returns Solidity proof bytes', async () => {
    const messages = []
    const endpoint = {
      ready: Promise.resolve(),
      onmessage: null,
      onerror: null,
      terminate: jest.fn(),
      postMessage: jest.fn((message, transfer) => {
        messages.push({ message, transfer })
        queueMicrotask(() => endpoint.onmessage({ data: { id: message.id, type: 'result', proof: '0xproof' } }))
      })
    }
    const runtime = createLegacyProofRuntime({ createEndpoint: () => endpoint })
    const assets = { circuit: { templates: {} }, provingKey: new ArrayBuffer(8) }

    await expect(runtime.prove({ root: 1n, pathElements: [2n] }, assets)).resolves.toBe('0xproof')
    await expect(runtime.prove({ root: 3n }, assets)).resolves.toBe('0xproof')

    expect(messages[0].message.input).toEqual({ root: '1', pathElements: ['2'] })
    expect(messages[0].message.circuit).toBe(assets.circuit)
    expect(messages[0].message.provingKey).toBeInstanceOf(ArrayBuffer)
    expect(messages[0].transfer).toHaveLength(1)
    expect(messages[1].message).not.toHaveProperty('circuit')
    expect(messages[1].message).not.toHaveProperty('provingKey')
  })

  it('resends proof assets after a worker request fails', async () => {
    const messages = []
    const endpoint = {
      ready: Promise.resolve(),
      onmessage: null,
      onerror: null,
      terminate: jest.fn(),
      postMessage: jest.fn((message) => {
        messages.push(message)
        queueMicrotask(() =>
          endpoint.onmessage({
            data:
              messages.length === 1
                ? { id: message.id, type: 'error', error: { message: 'runtime failed' } }
                : { id: message.id, type: 'result', proof: '0xproof' }
          })
        )
      })
    }
    const runtime = createLegacyProofRuntime({ createEndpoint: () => endpoint })
    const assets = { circuit: {}, provingKey: new ArrayBuffer(8) }

    await expect(runtime.prove({}, assets)).rejects.toThrow('runtime failed')
    await expect(runtime.prove({}, assets)).resolves.toBe('0xproof')

    expect(messages[0]).toHaveProperty('circuit')
    expect(messages[1]).toHaveProperty('circuit')
    expect(messages[1]).toHaveProperty('provingKey')
  })
})
