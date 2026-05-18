(function () {
  try {
    var path = window.location.pathname
    if (path === '/auth' || path.indexOf('/auth/') === 0) return
    var q = window.location.search || ''
    var searchType = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q).get('type')
    var h = window.location.hash
    var hashType = h && h.length >= 2 ? new URLSearchParams(h.slice(1)).get('type') : null
    if (searchType !== 'recovery' && hashType !== 'recovery') return
    window.location.replace(window.location.origin + '/auth' + q + (h || ''))
  } catch (e) {}
})()
