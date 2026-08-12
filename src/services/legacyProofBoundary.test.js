const fs = require('fs')
const path = require('path')

const collectSourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(fullPath)
    return /\.(js|ts|tsx)$/.test(entry.name) && !/\.test\.(js|ts|tsx)$/.test(entry.name)
      ? [fullPath]
      : []
  })

describe('legacy proof architecture boundary', () => {
  it('keeps old proof packages and source transforms out of application modules', () => {
    const root = path.resolve(__dirname, '../..')
    const source = collectSourceFiles(path.join(root, 'src'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n')
    const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')

    expect(source).not.toMatch(/@tornado\/(websnark|snarkjs)/)
    expect(source).not.toContain('genWitnessAndProve')
    expect(viteConfig).not.toContain('use-snarkjs-big-integer-compatibility')
    expect(viteConfig).not.toContain('transformSnarkjsSource')
  })

  it('allows only the proof service to call the legacy runtime', () => {
    const root = path.resolve(__dirname, '../..')
    const consumers = collectSourceFiles(path.join(root, 'src')).filter(
      (file) => !file.endsWith(path.join('services', 'proof.js')) && !file.endsWith('legacyProofRuntime.ts')
    )

    for (const file of consumers) {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('legacyProofRuntime')
    }
  })
})
