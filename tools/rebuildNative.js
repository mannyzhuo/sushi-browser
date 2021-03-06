const sh = require('shelljs')
const fs = require("fs")
const path = require("path")

const libs = [
  '../node_modules/node-pty',
  '../resource/winctl',
  '../node_modules/robotjs']

for(let lib of libs){
  rebuild(path.join(__dirname,lib))
}

function rebuild(lib){
  sh.cd(lib)

  // node-gyp rebuild --target=6.1.5 --arch=ia32 --dist-url=https://atom.io/download/electron
  if(sh.exec('node-gyp rebuild --target=6.1.9 --arch=x64 --dist-url=https://atom.io/download/electron').code !== 0) {
    console.log("ERROR")
    process.exit()
  }
}

`
D:
cd D:\\web-dev-browser
npm install sqlite3 --build-from-source --runtime=electron --target=6.1.9 --target_arch=x64 --dist-url=https://electronjs.org/headers
cd D:\\web-dev-browser\\resource\\winctl
node-gyp rebuild --target=6.1.9 --arch=x64 --dist-url=https://atom.io/download/electron
cd D:\\web-dev-browser\\node_modules\\robotjs
node-gyp rebuild --target=6.1.9 --arch=x64 --dist-url=https://atom.io/download/electron
cd D:\\web-dev-browser\\node_modules\\node-pty
node-gyp rebuild --target=6.1.9 --arch=x64 --dist-url=https://atom.io/download/electron
`

`
D:
cd D:\\sushi-browser-release32
npm install sqlite3 --build-from-source --runtime=electron --target=6.1.9 --target_arch=ia32 --dist-url=https://electronjs.org/headers
cd D:\\sushi-browser-release32\\resource\\winctl
node-gyp rebuild --target=6.1.9 --arch=ia32 --dist-url=https://atom.io/download/electron
cd D:\\sushi-browser-release32\\node_modules\\robotjs
node-gyp rebuild --target=6.1.9 --arch=ia32 --dist-url=https://atom.io/download/electron
cd D:\\sushi-browser-release32\\node_modules\\node-pty
node-gyp rebuild --target=6.1.9 --arch=ia32 --dist-url=https://atom.io/download/electron
`
