import { spawnSync } from 'node:child_process'

const audit = spawnSync('yarn', ['audit', '--groups', 'dependencies', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024
})

if (audit.stderr) process.stderr.write(audit.stderr)

let summary
for (const line of audit.stdout.split('\n')) {
  if (!line.trim()) continue
  try {
    const message = JSON.parse(line)
    if (message.type === 'auditSummary') summary = message.data
  } catch {
    // Yarn may add non-JSON diagnostics around the JSON stream; the summary remains authoritative.
  }
}

if (!summary) {
  process.stderr.write('Unable to read the Yarn audit summary.\n')
  process.exit(audit.status || 1)
}

const { vulnerabilities } = summary
process.stdout.write(
  `Production dependency audit: ${vulnerabilities.critical} critical, ${vulnerabilities.high} high, ` +
    `${vulnerabilities.moderate} moderate, ${vulnerabilities.low} low.\n`
)

if (vulnerabilities.critical > 0 || vulnerabilities.high > 0) process.exit(1)
