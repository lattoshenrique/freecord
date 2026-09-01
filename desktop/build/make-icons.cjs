// Rasteriza os SVGs de ícone preservando o alfa. O qlmanage achata sobre branco,
// que era a origem da borda sólida; o Electron pinta numa superfície transparente.
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const windows = []

const jobs = [
  ['icon.svg', 'icon.png'],
  ['icon-win.svg', 'icon-win.png'],
]

function render(src, out) {
  const scratchDir = mkdtempSync(join(tmpdir(), 'freecord-icons-'))
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      transparent: true,
      webPreferences: { offscreen: true },
    })
    // A janela fica viva até o fim: destruir uma offscreen no meio derruba a próxima.
    windows.push(win)
    const finish = (err) => {
      clearTimeout(timer)
      rmSync(scratchDir, { recursive: true, force: true })
      err ? reject(err) : resolve()
    }
    const timer = setTimeout(() => finish(new Error(`tempo esgotado ao renderizar ${src}`)), 20000)
    win.webContents.once('paint', (_event, _dirty, image) => {
      try {
        writeFileSync(join(__dirname, out), image.toPNG())
        console.log(`${src} -> ${out}`)
        finish()
      } catch (err) {
        finish(err)
      }
    })
    const svg = readFileSync(join(__dirname, src), 'utf8')
    const page = `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`
    const scratch = join(scratchDir, 'page.html')
    writeFileSync(scratch, page)
    win.loadFile(scratch).catch(finish)
  })
}

app.whenReady().then(async () => {
  try {
    for (const [src, out] of jobs) await render(src, out)
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
  for (const win of windows) win.destroy()
  app.quit()
})
