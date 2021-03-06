import mime from 'mime'
const fs = require('fs')
const http = require('http')
const LRUCache = require('lru-cache')
const WebSocket = require('ws')

function sendFile(req, res, filePath, fileSize) {
  const mimeType = mime.getType(filePath)
  console.log('mimeType', mimeType)
  const range = req.headers.range
  let file
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mimeType,
    })
    file = fs.createReadStream(filePath, {start, end})
  }
  else {
    res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': mimeType})
    file = fs.createReadStream(filePath)
  }
  file.pipe(res)
  file.on('error', (err) => sendError(req, res, 500))
}

function sendSuccess(res) {
  res.writeHead(200, {'Content-Type' : 'text/plain'})
  res.write('')
  res.end()
}

function sendError(req, res, statusCode) {
  res.writeHead(statusCode, {'Content-Type': 'text/html'})
  res.write(`<!DOCTYPE html><html><body><h1>${statusCode}</h1></body></html>`)
  res.end()
  console.log(`ERROR ${statusCode}: ${req.method} ${req.url}`)
}


const cache = new LRUCache(1000)
export default function createServer(port, key, listener){
  const server = http.createServer(async (req, res) => {
    const parsed = new URL(`http://localhost:${port}${req.url}`)
    const _key = parsed.searchParams.get('key')
    if(key != _key || req.headers.host != `localhost:${port}`) return sendError(req, res, 403)

    res.setHeader('Access-Control-Allow-Origin', '*')

    let data
    if(req.method == 'POST'){
      data = ''
      req.on('data', chunk=>{
        data += chunk
      })

      await new Promise(resolve => req.on('end', resolve))
    }
    else{
      data = parsed.searchParams.get('data')
    }

    if(data){
      let obj = cache.get(data)
      if(!obj){
        obj = JSON.parse(data)
        cache.set(data, obj)
      }
      listener(obj)
      sendSuccess(res)
      // console.log(`http://localhost:${port}${req.url}`, filePath)
    }
    else{
      let filePath = parsed.searchParams.get('file')
      if(filePath.startsWith('file://')) filePath = filePath.slice(7)
      fs.stat(filePath, (err, stats) => {
        if (err) {
          if ((/ENOENT/).test(err.message)) return sendError(req, res, 404)
          else return sendError(req, res, 500)
        }

        return sendFile(req, res, filePath, stats.size)
      })
    }
  })

  const wss = new WebSocket.Server({ server , path: `/${key}`})

  wss.on('connection', function connection(ws) {
    ws.on('message', (data) => {
      try{
        // console.log(111666,data)
        if(data){
          let obj = cache.get(data)
          if(!obj){
            obj = JSON.parse(data)
            cache.set(data, obj)
          }
          listener(obj)
        }
      }catch(e){
        console.log(e)
      }
    })
  })

  server.listen(port)
}
