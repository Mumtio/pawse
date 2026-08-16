const input = document.getElementById('token')
const status = document.getElementById('status')

function setStatus(text, kind) {
  status.textContent = text
  status.className = kind || ''
}

chrome.storage.local.get('pawseToken').then(({ pawseToken }) => {
  if (pawseToken) {
    input.value = pawseToken
    test()
  }
})

document.getElementById('save').addEventListener('click', async () => {
  const token = input.value.trim().toUpperCase()
  await chrome.storage.local.set({ pawseToken: token })
  test()
})

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('save').click()
})

function test() {
  setStatus('checking…')
  chrome.runtime.sendMessage({ type: 'test' }, (res) => {
    void chrome.runtime.lastError
    if (!res) return setStatus('could not reach the extension worker', 'bad')
    if (res.ok) {
      setStatus(
        res.focusActive
          ? `paired — ${res.catName} is in a focus session`
          : `paired — ${res.catName} is idle`,
        'ok'
      )
      return
    }
    if (res.error === 'offline') return setStatus('Pawse is not running on this computer', 'bad')
    if (res.error === 'bad-token') return setStatus('that code does not match', 'bad')
    if (res.error === 'not-paired') return setStatus('enter your pairing code', '')
    setStatus(`could not connect (${res.error})`, 'bad')
  })
}
