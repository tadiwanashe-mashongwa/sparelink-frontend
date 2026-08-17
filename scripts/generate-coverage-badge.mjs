import { mkdir, readFile, writeFile } from 'node:fs/promises'

const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'))
const percentage = summary.total.statements.pct
const message = `${percentage}%`
const labelWidth = 66
const messageWidth = Math.max(48, message.length * 8 + 18)
const colour = percentage >= 80 ? '#4c1' : percentage >= 60 ? '#dfb317' : '#e05d44'
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth + messageWidth}" height="20" role="img" aria-label="coverage: ${message}"><linearGradient id="a" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="b"><rect width="100%" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#b)"><path fill="#555" d="M0 0h${labelWidth}v20H0z"/><path fill="${colour}" d="M${labelWidth} 0h${messageWidth}v20H${labelWidth}z"/><path fill="url(#a)" d="M0 0h${labelWidth + messageWidth}v20H0z"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">coverage</text><text x="${labelWidth / 2}" y="14">coverage</text><text x="${labelWidth + messageWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${message}</text><text x="${labelWidth + messageWidth / 2}" y="14">${message}</text></g></svg>`

await mkdir('.github/badges', { recursive: true })
await writeFile('.github/badges/coverage.svg', svg)
