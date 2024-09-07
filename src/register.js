import module from 'node:module'
import url from 'node:url'

module.register('./ten.hot.js', url.pathToFileURL('./'))
