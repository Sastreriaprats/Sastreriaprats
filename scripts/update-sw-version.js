const fs = require('fs')
const path = require('path')

const swPath = path.join(__dirname, '..', 'public', 'sw.js')
let content = fs.readFileSync(swPath, 'utf8')
const newVersion = 'prats-v' + Date.now()
content = content.replace(/var CACHE_VERSION = '[^']+'/,  `var CACHE_VERSION = '${newVersion}'`)
fs.writeFileSync(swPath, content)
console.log('SW version updated to:', newVersion)
