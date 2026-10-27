import { chromium } from 'playwright-core'
import { pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'

const OUT = 'C:/CRYPTO MONEY MAKER/tmp/c2p/media'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1247/chrome-win64/chrome.exe' })
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }
})
const page = await ctx.newPage()
await page.goto(pathToFileURL(OUT + '/deck.html').href)
await page.waitForTimeout(43000)
const video = page.video()
await ctx.close()
await browser.close()
const p = await video.path()
console.log('VIDEO', p)
