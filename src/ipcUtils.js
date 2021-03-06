import {ipcMain, app, dialog, BrowserWindow, shell, session, clipboard, nativeImage, Menu, screen} from 'electron'
import {Browser, BrowserPanel, BrowserView, webContents} from './remoted-chrome/Browser'
import favorite from './remoted-chrome/favorite'
const BrowserWindowPlus = require('./BrowserWindowPlus')
import fs from 'fs-extra'
import path from 'path'
import sh from 'shelljs'
import uuid from 'node-uuid'
import PubSub from './render/pubsub'
import {toKeyEvent} from 'keyboardevent-from-electron-accelerator'
import https from 'https'
import URL from 'url'
import robot from 'robotjs'
import DpiUtils from './remoted-chrome/DpiUtils'
import os from 'os'

const isWin7 = os.platform() == 'win32' && os.release().startsWith('6.1')

const sanitizeFilename = require('./sanitizeFilename')
const seq = require('./sequence')
const {state,tabState,visit,savedState,automation,automationOrder,note,inputHistory,videoController} = require('./databaseFork')
const db = require('./databaseFork')
const FfmpegWrapper = require('./FfmpegWrapper')
const defaultConf = require('./defaultConf')
const locale = require('../brave/app/locale')
const extensions = require('./extension/extensions')

const youtubedl = require('youtube-dl')
import {getFocusedWebContents,getCurrentWindow} from './util'
const isWin = process.platform == 'win32'
const isLinux = process.platform === 'linux'
const isDarwin = process.platform === 'darwin'
const meiryo = isWin && Intl.NumberFormat().resolvedOptions().locale == 'ja'
import mainState from './mainState'
import extensionInfos from "./extensionInfos";
import {history, token} from "./databaseFork";
import winctl from "../resource/winctl";
const open = require('./open')
const {readMacro,readMacroOff,readTargetSelector,readTargetSelectorOff,readComplexSearch,readFindAll} = require('./readMacro')
const sharedState = require('./sharedStateMain')
const request = require('request')
const bindPath = 'chrome-extension://dckpbojndfoinamcdamhkjhnjnmjkfjd/bind.html'

function exec(command) {
  console.log(command)
  return new Promise(function(resolve, reject) {
    require('child_process').exec(command, function(error, stdout, stderr) {
      if (error) {
        return reject(error);
      }
      resolve({stdout, stderr});
    });
  });
}


function getBindPage(tabId){
  return webContents.getAllWebContents().filter(wc=>wc.id === tabId)
}

function scaling(num){
  return Math.round(num * mainState.scaleFactor)
}

function diffArray(arr1, arr2) {
  return arr1.filter(e=>!arr2.includes(e))
}

function shellEscape(s){
  return '"'+s.replace(/(["\t\n\r\f'$`\\])/g,'\\$1')+'"'
}


function formatDate(date) {
  return `${date.getFullYear()}${('0' + (date.getMonth() + 1)).slice(-2)}${('0' + date.getDate()).slice(-2)}_${('0' + date.getHours()).slice(-2)}${('0' + date.getMinutes()).slice(-2)}${('0' + date.getSeconds()).slice(-2)}`;
}


function eachSlice(arr,size){
  const newArray = []
  for (let i = 0, l = arr.length; i < l; i += size){
    newArray.push(arr.slice(i, i + size))
  }
  return newArray
}

ipcMain.on('file-system',(event,key,method,arg)=>{
  if(!['stat','readdir','rename'].includes(method)) return
  fs[method](...arg,(err,rets)=>{
    if(err){
      console.log(err)
    }
    else if(method == 'stat'){
      rets = {isDirectory:rets.isDirectory(),mtime:rets.mtime,size:rets.size}
    }
    event.sender.send(`file-system-reply_${key}`,rets)
  })
})

ipcMain.on('file-system-list',(event,key,method,args)=>{
  if(!['stat','readdir'].includes(method)) return
  Promise.all(args.map(arg=>{
    return new Promise((resolve,reject)=>{
      fs[method](...arg,(err,rets)=>{
        if(err){
          resolve(null)
          return
        }
        if(method == 'stat'){
          rets = {isDirectory:rets.isDirectory(),mtime:rets.mtime,size:rets.size}
        }
        resolve(rets)
      })
    })
  })).then(rets=>{
    event.sender.send(`file-system-list-reply_${key}`,rets.filter(x=>x))
  })
})

ipcMain.on('shell-list',(event,key,method,args)=>{
  if(!['mv'].includes(method)) return
  event.sender.send(`shell-list-reply_${key}`,args.map(arg=>sh[method](...arg).code))
})

ipcMain.on('app-method',(event,key,method,arg)=>{
  if(!['getPath'].includes(method)) return
  event.sender.send(`app-method-reply_${key}`,app[method](arg))
})

ipcMain.on('move-trash',(event,key,args)=>{
  for(let arg of args){
    shell.moveItemToTrash(path.join(arg))
  }
  event.sender.send(`move-trash-reply_${key}`,{})
})

ipcMain.on('create-file',(event,key,path,isFile)=>{
  if(isFile){
    fs.writeFile(path,'',_=> event.sender.send(`create-file-reply_${key}`,{}))
  }
  else{
    fs.mkdir(path,_=> event.sender.send(`create-file-reply_${key}`,{}))
  }
})

ipcMain.on('show-dialog-exploler',(event,key,info,tabId)=>{
  const cont = tabId && (sharedState[tabId] || webContents.fromId(tabId))
  console.log(tabId,cont)
  if(info.inputable || info.normal || info.convert){
    const key2 = uuid.v4();
    (cont ? event.sender : event.sender.hostWebContents2).send('show-notification',
      {id:(cont || event.sender).id,
        key: key2, title: info.title, text: info.text,
        initValue: info.normal ? void 0 : info.initValue,
        needInput: info.normal || info.convert ? void 0 : info.needInput || [""],
        convert: info.convert,
        option: info.normal ? void 0 : info.option || [""],
        buttons : info.normal ? info.buttons : void 0})

    ipcMain.once(`reply-notification-${key2}`,(e,ret)=>{
      if(ret.pressIndex !== 0){
        event.sender.send(`show-dialog-exploler-reply_${key}`)
      }
      else{
        console.log(`show-dialog-exploler-reply_${key}`)
        event.sender.send(`show-dialog-exploler-reply_${key}`,ret.value || ret.pressIndex)
      }
    })
  }
  else{
    let option = { properties: ['openDirectory'] }
    if(info.defaultPath) option.defaultPath = info.defaultPath
    if(info.needVideo){
      option.properties = ['openFile', 'multiSelections']
      option.filters = [
        {name: 'Media Files', extensions: ['3gp','3gpp','3gpp2','asf','avi','dv','flv','m2t','m4v','mkv','mov','mp4','mpeg','mpg','mts','oggtheora','ogv','rm','ts','vob','webm','wmv']},
        {name: 'All Files', extensions: ['*']}
      ]
    }
    else if(info.needIcon){
      option.properties = ['openFile']
      option.filters = [
        {name: 'Image Files', extensions: ['ico','icon','png','gif','bmp','jpg','jpeg']},
        {name: 'All Files', extensions: ['*']}
      ]
    }
    dialog.showOpenDialog(Browser.getFocusedWindow(), option, (selected) => {
      if (selected && selected.length > 0) {
        event.sender.send(`show-dialog-exploler-reply_${key}`,info.needVideo ? selected : selected[0])
      }
      else{
        event.sender.send(`show-dialog-exploler-reply_${key}`)
      }
    })
  }
})


// ipcMain.on('get-favorites',(event,key,dbKey)=>{
//   favorite.findOne({key: dbKey}).then(ret=>{
//     favorite.find({key:{$in: ret.children}}).then(ret2=>{
//       event.sender.send(`get-favorites-reply_${key}`,ret2)
//     })
//   })
// })


ipcMain.on('insert-favorite',(event,key,writePath,data,isNote)=>{
  console.log("insert",writePath,data)

  if(!isNote){
    return favorite.insert(key,writePath,data).then(()=> event.sender.send(`insert-favorite-reply_${key}`,key))
  }

  const db = note
  db.insert({key,...data,created_at: Date.now(), updated_at: Date.now()}).then(ret=>{
    db.update({ key: writePath }, { $push: { children: key }, $set:{updated_at: Date.now()} }).then(ret2=>{
      if(ret2 == 0 && writePath == 'top-page'){
        db.insert({key:writePath, children: [key], is_file: false, title: 'Top Page' ,created_at: Date.now(), updated_at: Date.now()}).then(ret=>{
          db.update({ key: 'root' }, { $push: { children: 'top-page' }, $set:{updated_at: Date.now()} }).then(ret2=> {
            event.sender.send(`insert-favorite-reply_${key}`,key)
          })
        })
      }
      else{
        event.sender.send(`insert-favorite-reply_${key}`,key)
      }
    })
  })
})

ipcMain.on('insert-favorite2',(event,key,writePath,dbKey,data,isNote)=>{
  console.log("insert",writePath,data)

  if(!isNote){
    return favorite.insert(key,writePath,data,dbKey).then(()=> event.sender.send(`insert-favorite-reply_${key}`,key))
  }

  const db = note
  db.findOne({key:writePath}).then(rec=>{
    const ind = rec.children.indexOf(dbKey)
    rec.children.splice(ind+1,0,key)
    console.log("insert2",rec)
    db.insert({key,...data,created_at: Date.now(), updated_at: Date.now()}).then(ret=>{
      console.log("insert3",ret)
      db.update({ key: writePath }, { $set:{children: rec.children,updated_at: Date.now()}}).then(ret2=>{
        event.sender.send(`insert-favorite2-reply_${key}`,key)
      })
    })
  })
})

function sortKeys(keys, collection){
  const ret = []
  for(const key of keys){
    const x = collection.find(c=> c.key == key)
    if(x) ret.push(x)
  }
  return ret
}

async function recurDelete(keys,list,isNote){
  const db = note
  keys = keys || []
  const ret = sortKeys(keys, await db.find({key:{$in: keys}}))
  const nextKeys = Array.prototype.concat.apply([],ret.map(ret=>ret.children)).filter(ret=>ret)
  list.splice(list.length,0,...nextKeys)
  if(nextKeys && nextKeys.length > 0) {
    return (await recurDelete(nextKeys, list,isNote))
  }
}

ipcMain.on('delete-favorite',(event,key,dbKeys,parentKeys,isNote)=>{
  if(!isNote){
    return favorite.remove(dbKeys).then(()=> event.sender.send(`delete-favorite-reply_${key}`,key))
  }

  let deleteList = dbKeys
  const db = note
  recurDelete(dbKeys,deleteList,isNote).then(ret=>{
    deleteList = [...new Set(deleteList)]
    console.log('del',deleteList)
    db.remove({key: {$in : deleteList}}, { multi: true }).then(ret2=>{
      Promise.all(parentKeys.map((parentKey,i)=>{
        const dbKey = dbKeys[i]
        db.update({ key: parentKey }, { $pull: { children: dbKey }, $set:{updated_at: Date.now()} })
      })).then(ret3=>{
        event.sender.send(`delete-favorite-reply_${key}`,key)
      })
    })
  })
})

ipcMain.on('move-favorite',async (event,key,args,isNote)=>{
  console.log(99,args)

  if(!isNote){
    for(let arg of args.reverse()){
      const [dbKey,oldDirectory,newDirectory,dropKey] = arg
      await favorite.move(dbKey,newDirectory,dropKey)
    }
    return event.sender.send(`move-favorite-reply_${key}`,key)
  }

  const db = note
  if(!args[0][3]){
    for(let arg of args){
      const [dbKey,oldDirectory,newDirectory,dropKey] = arg
      const r = await db.findOne({key: oldDirectory})
      if(r && r.children.indexOf(dbKey) != -1){
        await db.update({ key: oldDirectory }, { $pull: { children: dbKey }, $set:{updated_at: Date.now()}})
        const r2 = await db.findOne({key: newDirectory})
        if(r2 && r2.children.indexOf(dbKey) == -1){
          await db.update({ key: newDirectory }, { $push: { children: dbKey }, $set:{updated_at: Date.now()}})
        }
      }
    }
  }
  else{
    for(let arg of args.reverse()){
      const [dbKey,oldDirectory,newDirectory,dropKey] = arg
      const r = await db.findOne({key: oldDirectory})
      if(r && r.children.indexOf(dbKey) != -1) {
        await db.update({key: oldDirectory}, {$pull: {children: dbKey}, $set: {updated_at: Date.now()}})
        const ret2 = await db.findOne({key: newDirectory})
        const children = ret2.children.filter(c => c != dbKey)
        const ind = children.indexOf(dropKey)
        children.splice(ind + 1, 0, dbKey)
        console.log(88, children)
        await db.update({key: newDirectory}, {$set: {children, updated_at: Date.now()}})
      }
    }
  }
  event.sender.send(`move-favorite-reply_${key}`,key)
})

ipcMain.on('rename-favorite',async (event,key,dbKey,newName,isNote)=>{
  console.log(99,dbKey,newName)
  if(!isNote){
    return favorite.update(dbKey, newName).then(()=> event.sender.send(`rename-favorite-reply_${key}`,key))
  }

  const db = note
  const d = await db.findOne({ key: dbKey })
  if(d && d.title == newName.title) return

  db.update({ key: dbKey }, { $set: {...newName,updated_at: Date.now()}}).then(ret2=>{
    event.sender.send(`rename-favorite-reply_${key}`,key)
  })
})


async function recurGet(keys,num,isNote){
  const db = note
  keys = keys || []
  const ret = sortKeys(keys, await db.find({key:{$in: keys}}))
  const datas = []
  const promises = []

  for(let x of ret){
    const data = {key:x.key,title:x.title,url:x.url,favicon:x.favicon,is_file:x.is_file}
    if(x.children){
      promises.push(recurGet(num ? x.children.slice(num) : x.children,void 0,isNote))
    }
    else{
      promises.push(false)
    }
    datas.push(data)
  }
  const rets = await Promise.all(promises)
  rets.map((ret,i)=>{
    if(ret) datas[i].children2 = ret
  })
  return datas
}


ipcMain.on('get-all-favorites',async(event,key,dbKeys,num,isNote)=>{
  const ret = isNote ? await recurGet(dbKeys,num,isNote) : [await favorite.getFavoritesTree(dbKeys,num)]
  event.sender.send(`get-all-favorites-reply_${key}`,ret)
})

ipcMain.on('get-all-states',async(event,key,range)=>{
  const cond =  !Object.keys(range).length ? range :
    {$or: [{ created_at: (
          range.start === void 0 ? { $lte: range.end } :
            range.end === void 0 ? { $gte: range.start } :
              { $gte: range.start ,$lte: range.end }
        )}, {user: true}]}
  const ret = await savedState.find_sort([cond],[{ created_at: -1 }])
  event.sender.send(`get-all-states-reply_${key}`,ret)
})

ipcMain.on('get-favorites-shallow', async(event,key,dbKey,limit)=>{
  const result = await favorite.getFavoritesTree([dbKey], limit, true)
  // console.log('get-favorites-shallow',result)
  event.sender.send(`get-favorites-shallow-reply_${key}`,result)
})

async function recurFind(keys,list,isNote){
  const db = isNote ? note : favorite

  const ret = []
  for(let key of keys){
    const result = await favorite.getSubTreeShallow(key)
    ret.push(result)
  }
  const addKey = []
  let children = ret.map(x=>{
    if(x.url){
      addKey.push(x.url)
    }
    return x.children
  })
  const nextKeys = Array.prototype.concat.apply([],children).filter(ret=>ret).map(x=>x.id)
  list.splice(list.length,0,...addKey)
  if(nextKeys && nextKeys.length > 0) {
    return (await recurFind(nextKeys, list, isNote))
  }
}

ipcMain.on('open-favorite',async (event,key,dbKeys,tabId,type,isNote)=>{
  let list = []
  const cont = tabId !== 0 && (sharedState[tabId] || webContents.fromId(tabId))
  const ret = await recurFind(dbKeys,list,isNote)
  const host = cont ? event.sender : event.sender.hostWebContents2
  if(type == "openInNewTab" || type=='openInNewPrivateTab' || type=='openInNewTorTab' || type=='openInNewSessionTab'){
    for(let url of list){
      await new Promise(async (resolve,reject)=>{
        if(tabId){
          host.send("new-tab",tabId == -1 ? event.sender.id : tabId,url,type=='openInNewSessionTab' ? `persist:${seq()}` : type=='openInNewTorTab' ? 'persist:tor' : type=='openInNewPrivateTab' ? `${seq(true)}` : false)
        }
        else{
          host.send("new-tab-opposite", event.sender.id,url,(void 0),type=='openInNewSessionTab' ? `persist:${seq()}` : type=='openInNewTorTab' ? 'persist:tor' : type=='openInNewPrivateTab' ? `${seq(true)}` : false)
        }
        await new Promise(r=>setTimeout(r,100))
        resolve()
      })
    }
  }
  else{
    const win = BrowserWindow.fromWebContents(host)
    ipcMain.once('get-private-reply',(e,privateMode)=>{
      console.log(67866,JSON.stringify({urls:list.map(url=>{return {url}}), type: type == 'openInNewWindow' ? 'new-win' : type == 'openInNewWindowWithOneRow' ? 'one-row' : 'two-row'}))
      BrowserWindowPlus.load({id:win.id,sameSize:true,tabParam:JSON.stringify({urls:list.map(url=>{return {url}}),
          type: type == 'openInNewWindow' ? 'new-win' : type == 'openInNewWindowWithOneRow' ? 'one-row' : 'two-row'})})
    })
    win.webContents.send('get-private', (cont || event.sender).id)
  }

  console.log(list)
  event.sender.send(`open-favorite-reply_${key}`,key)
})


ipcMain.on('search-favorite',async (event,key,location,limit)=>{
  event.sender.send(`search-favorite-reply_${key}`, (await favorite.search(location)).filter(x=>x.location).slice(0, limit))
})

ipcMain.on('open-savedState',async (event,key,tabId,datas)=>{
  let list = []
  const cont = tabId !== 0 && (sharedState[tabId] || webContents.fromId(tabId))
  const host = cont ? event.sender : event.sender.hostWebContents2

  const win = BrowserWindow.fromWebContents(host)
  console.log(52,datas,52)
  ipcMain.once('get-private-reply',(e,privateMode)=>{
    if(typeof datas == "string"){
      BrowserWindowPlus.load({id:win.id,sameSize:true,tabParam:JSON.stringify({urls:[{tabKey:datas}],type: 'new-win'})})
    }
    else{
      if(!Array.isArray(datas)) datas = [datas]
      for(let newWin of datas){
        BrowserWindowPlus.load({id:win.id, x:newWin.x, y:newWin.y, width:newWin.width, height:newWin.height,
          maximize: newWin.maximize, tabParam:JSON.stringify(newWin)})
      }
    }
  })
  win.webContents.send('get-private', (cont || event.sender).id)


  console.log(list)
  event.sender.send(`open-savedState-reply_${key}`,key)
})

ipcMain.on('delete-savedState',(event,key,dbKey)=>{
  let opt = [{_id: dbKey}]
  if(typeof dbKey != "string"){
    opt = [dbKey, { multi: true }]
  }
  savedState.remove(...opt).then(ret=>{
    event.sender.send(`delete-savedState-reply_${key}`,key)
  })
})


ipcMain.on('rename-savedState',(event,key,dbKey,newName)=>{
  console.log(99,dbKey,newName)
  savedState.update({_id: dbKey }, { $set: {...newName,updated_at: Date.now()}}).then(ret2=>{
    event.sender.send(`rename-savedState-reply_${key}`,key)
  })
})


const resourcePath = path.join(app.getPath('userData'),'resource')

ipcMain.on('get-resource-path',e=>{
  console.log(77,resourcePath)
  e.sender.send('get-resource-path-reply',resourcePath)
})


ipcMain.on('force-click',(event,{x,y})=> {
  event.sender.sendInputEvent({ type: 'mouseDown', x, y, button: 'left',clickCount: 1});
  event.sender.sendInputEvent({ type: 'mouseUp', x, y, button: 'left',clickCount: 1});
})

ipcMain.on('force-mouse-up',(event,{x,y})=> {
  event.sender.sendInputEvent({ type: 'mouseUp', x, y, button: 'left',clickCount: 1});
})

ipcMain.on('send-input-event',(e,{type,tabId,x,y,button,deltaY,keyCode,modifiers})=>{
  console.log(type,tabId,x,y,deltaY)
  const cont = webContents.fromId(tabId)
  if(!cont || cont.isDestroyed()) return

  if(type == 'mouseDown'){
    cont.sendInputEvent({ type, x, y, button, clickCount: 1})
  }
  else if(type == 'mouseUp'){
    cont.sendInputEvent({ type, x, y, button, clickCount: 1})
  }
  else if(type == 'mouseWheel'){
    cont.sendInputEvent({ type, x, y, deltaX: 0, deltaY, canScroll: true})
  }
  else if(type == 'mouseMove'){
    cont.sendInputEvent({ type, x, y})
  }
  else if(type == 'keyDown'){
    console.log(999,keyCode, modifiers)
    cont.sendInputEvent({type: 'keyDown', keyCode, modifiers})
    cont.sendInputEvent({type: 'char', keyCode, modifiers})
  }

})

ipcMain.on('toggle-fullscreen',async (event,cancel)=> {
  if(!Browser.CUSTOM_CHROMIUM) return

  const win = BrowserWindow.fromWebContents(event.sender.hostWebContents2 || event.sender)
  const isFullScreen = win._isFullScreen

  console.log('toggle-fullscreen', isFullScreen, cancel)

  // win.setResizable(true)
  if(cancel && !isFullScreen) return
  win.webContents.send('switch-fullscreen',!isFullScreen)
  win.setFullScreenable(true)
  const menubar = win.isMenuBarVisible()
  win.setFullScreen(!isFullScreen)
  win._isFullScreen = !isFullScreen
  win.setMenuBarVisibility(menubar)
  win.setFullScreenable(false)
  if(!isFullScreen){
    if(win.isMaximized()) win.webContents.send('adjust-maxmize-size', false)
    // win.setResizable(false)
    for(const browserPanel of Object.values(BrowserPanel.panelKeys)){
      browserPanel.setAlwaysOnTop(true)
    }
  }
  else{
    for(const browserPanel of Object.values(BrowserPanel.panelKeys)){
      if(!win._alwaysOnTop) browserPanel.setAlwaysOnTop(false)
    }
    if(win.isMaximized()){
      win.webContents.send('adjust-maxmize-size', true)
    }
  }
})


// ipcMain.on('toggle-fullscreen2',(event,val,key)=> {
//   const win = BrowserWindow.fromWebContents(event.sender.hostWebContents2 || event.sender)
//   const isFullScreen = win.isFullScreen()
//   if(val === 1 && !isFullScreen){
//     event.sender.send(`toggle-fullscreen2-reply_${key}`, isFullScreen)
//     return
//   }
//
//   win.webContents.send('switch-fullscreen',!isFullScreen)
//   win.setFullScreenable(true)
//   const menubar = win.isMenuBarVisible()
//   win.setFullScreen(!isFullScreen)
//   win.setMenuBarVisibility(menubar)
//   win.setFullScreenable(false)
//   event.sender.send(`toggle-fullscreen2-reply_${key}`, !isFullScreen)
// })

function getYoutubeFileSize(url){
  const u = URL.parse(url)
  const options = {method: 'GET', hostname: u.hostname, port: 443, path: `${u.pathname}${u.search}`,
    headers: { 'Accept-Charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.7',
      'Accept-Language': 'en-us,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': process.userAgent }};
  return new Promise(r=>{
    let resolved
    setTimeout(_=>{
      resolved = true
      r()
    },5000)
    const req = https.request(options, function(res) {
        if(!resolved){
          resolved = true
          // console.log(888,res.headers)
          r(res.headers['content-length'] ? parseInt(res.headers['content-length']) : void 0)
        }
        res.destroy()
      }
    )
    req.end()
  })
}

const LRUCache = require('lru-cache')
const videoUrlsCache = new LRUCache(1000)
ipcMain.on('video-infos',(event,{url})=>{
  console.log(2222,url)
  const cache = videoUrlsCache.get(url)
  if(cache){
    event.sender.send(`video-infos-reply_${url}`,{cache:true,...cache})
    return
  }
  videoUrlsCache.set(url,{error:""})

  youtubedl.getInfo(url,void 0,{maxBuffer: 7000 * 1024}, async function(err, info) {
    if (err){
      console.log(err)
      videoUrlsCache.set(url,{error:err})
      event.sender.send(`video-infos-reply_${url}`,{error:err})
      return
    }
    // console.log(info)
    if(!info){
      if(url.includes("youtube.com/")){
        // ytdl.getInfo(url, (err, info)=> {
        //   if (err){
        //     videoUrlsCache.set(url,{error:err})
        //     event.sender.send(`video-infos-reply_${url}`,{error:'error2'})
        //   }
        //   else{
        //     const title = info.title
        //     const formats = info.formats
        //     videoUrlsCache.set(url,{title,formats})
        //     event.sender.send(`video-infos-reply_${url}`,{title,formats})
        //   }
        // })
      }
      else{
        videoUrlsCache.set(url,{error:'error'})
        event.sender.send(`video-infos-reply_${url}`,{error:'error3'})
      }
    }
    else{
      const title = info.title
      if(Array.isArray(info)){
        for(let i of info){
          const title = i.title
          videoUrlsCache.set(url, { title, formats: i.formats });
          event.sender.send(`video-infos-reply_${url}`, { title, formats: i.formats });
        }
      }
      else{
        if(url.includes("youtube.com/")){
          for(let f of info.formats){
            if(f.filesize) continue
            f.filesize = await getYoutubeFileSize(f.url)
          }
        }
        videoUrlsCache.set(url, { title, formats: info.formats});
        event.sender.send(`video-infos-reply_${url}`, { title, formats: info.formats });
      }
    }
  });
})


ipcMain.on('get-video-urls',(event,key,url)=>{
  console.log(2223,url)
  youtubedl.getInfo(url,void 0,{maxBuffer: 7000 * 1024}, function(err, info) {
    console.log(err, info)
    if (err){
      event.sender.send(`get-video-urls-reply_${key}`,null)
      return
    }
    event.sender.send(`get-video-urls-reply_${key}`,{url: info.url, filename: info.filename})
  })
})

ipcMain.on('open-page',async (event,url)=>{
  const cont = await getFocusedWebContents()
  if(cont) cont.hostWebContents2.send('new-tab', cont.id, url)
})

ipcMain.on('search-page',async (event,text)=>{
  const cont = await getFocusedWebContents()
  if(cont) cont.hostWebContents2.send('search-text', cont.id, text)
})

if(isWin){
  ipcMain.on('need-meiryo',e=>{
    e.sender.send('need-meiryo-reply',meiryo)
  })
}

ipcMain.on("change-title",(e,title)=>{
  const bw = BrowserWindow.fromWebContents(e.sender.webContents)
  if(!bw || bw.isDestroyed()) return
  if(title){
    bw.setTitle(`${title} - Sushi Browser`)
  }
  else{
    const cont = bw.webContents
    const key = uuid.v4()
    return new Promise((resolve,reject)=>{
      ipcMain.once(`get-focused-webContent-reply_${key}`,async (e,tabId)=>{
        if(!tabId) return
        const focusedCont = (sharedState[tabId] || webContents.fromId(tabId))
        if(focusedCont){
          if(!bw.isDestroyed()) bw.setTitle(`${await focusedCont.getTitle()} - Sushi Browser`)
        }
      })
      cont.send('get-focused-webContent',key)
    })
    bw.setTitle(`${title} - Sushi Browser`)
  }
})

let startSender
ipcMain.on('select-target',(e,val,selector)=>{
  const set = new Set()
  for(let win of BrowserWindow.getAllWindows()) {
    if(win.getTitle().includes('Sushi Browser')){
      set.add(win.webContents)
    }
  }

  const macro = val ? readTargetSelector() : readTargetSelectorOff()
  for(let cont of webContents.getAllWebContents()){
    if(!cont.isDestroyed() /*&& !cont.isBackgroundPage()*/ && set.has(cont.hostWebContents2)){
      cont.executeJavaScript(macro,()=>{})
    }
  }
  if(val){
    startSender = e.sender
  }
  else{
    startSender.send('select-target-reply',selector)
  }
})



let handleAddOp,handleReplyDialog,isRecording
ipcMain.on('record-op',(e,val)=>{
  isRecording = val
  if(val){
    handleAddOp = (e2,op)=>{
      e.sender.send('add-op',op)
    }
    ipcMain.on('add-op',handleAddOp)

    handleReplyDialog = (e2,{key,title,message,result,tabId,url,now})=>{
      const op =  {key, name: 'dialog', value:result ? 'ok' : 'cancel', url, tabId, now}
      e.sender.send('add-op',op)
    }
    ipcMain.on('reply-dialog',handleReplyDialog)
  }
  else{
    ipcMain.removeListener('add-op',handleAddOp)
    ipcMain.removeListener('reply-dialog',handleReplyDialog)
  }

  const set = new Set()
  for(let win of BrowserWindow.getAllWindows()) {
    if(win.getTitle().includes('Sushi Browser')){
      set.add(win.webContents)
      win.webContents.send('record-op',val)
    }
  }

  const macro = val ? readMacro() : readMacroOff()
  for(let cont of webContents.getAllWebContents()){
    if(!cont.isDestroyed() /*&& !cont.isBackgroundPage()*/ && set.has(cont.hostWebContents2)){
      cont.executeJavaScript(macro, ()=>{})
    }
  }

})

const extInfos = require('./extensionInfos')
const keyCache = {}
ipcMain.on('get-main-state',(e,key,names)=>{
  const ret = {}
  names.forEach(name=>{
    if(name == "ALL_KEYS"){
      for(let [key,val] of Object.entries(mainState)){
        if(key.startsWith("key") || key.endsWith("Video")){
          ret[key] = val
        }
      }
    }
    else if(name == "ALL_KEYS2"){
      for(let [key,val] of Object.entries(mainState)){
        if(key.startsWith("key") && !key.startsWith("keyVideo")){
          let cache = keyCache[val]
          if(!cache){
            const e = toKeyEvent(val)
            const val2 = e.key ? {key: e.key} : {code: e.code}
            if(e.ctrlKey) val2.ctrlKey = true
            if(e.metaKey) val2.metaKey = true
            if(e.shiftKey) val2.shiftKey = true
            if(e.altKey) val2.altKey = true
            let key2 = key.slice(3)
            keyCache[val] = [JSON.stringify(val2), `${key2.charAt(0).toLowerCase()}${key2.slice(1)}`]
            cache = keyCache[val]
          }
          ret[cache[0]] = cache[1]
        }
      }
    }
    else if(name == "isRecording"){
      ret[name] = isRecording ? readMacro() : void 0
    }
    else if(name == "alwaysOpenLinkNewTab"){
      ret[name] = mainState.lockTabs[e.sender.isDestroyed() ? null : e.sender.id] ? 'speLinkAllLinks' : mainState[name]
    }
    else if(name == "protectTab"){
      ret[name] = mainState.protectTabs[e.sender.isDestroyed() ? null : e.sender.id]
    }
    else if(name == "isVolumeControl"){
      ret[name] = mainState.isVolumeControl[e.sender.isDestroyed() ? null : e.sender.id]
    }
    else if(name == "extensions"){
      const extensions = {}
      for (let [k,v] of Object.entries(extInfos)) {
        if(!('url' in v) || v.name == "brave") continue
        const orgId = v.base_path.split(/[\/\\]/).slice(-2,-1)[0]
        extensions[k] = {name:v.name,url:v.url,basePath:v.base_path,version: (v.manifest.version || v.version),theme:v.theme,
          optionPage: v.manifest.options_page || (v.manifest.options_ui && v.manifest.options_ui.page),
          background: v.manifest.background && v.manifest.background.page,icons:v.manifest.icons,
          description: (v.manifest.description || v.description),enabled: v.manifest.enabled }
      }
      ret[name] = extensions
    }
    else if(name == 'themeInfo'){
      const theme = extInfos[mainState.enableTheme] && extInfos[mainState.enableTheme].theme
      if(theme){
        if(theme.images && !theme.datas){
          theme.datas = {}
          for(let name of ['theme_ntp_background','theme_ntp_attribution']){
            if(!theme.images[name]) continue
            const file = path.join(theme.base_path,theme.images[name])
            if(file && fs.existsSync(file)){
              theme.datas[name] = nativeImage.createFromPath(file).toDataURL()
            }
          }
        }
        for(let page of ['themeTopPage','themeBookmark','themeHistory','themeDownloader','themeExplorer','themeBookmarkSidebar','themeHistorySidebar','themeSessionManagerSidebar','themeTabTrashSidebar','themeTabHistorySidebar','themeExplorerSidebar']){
          theme[page] = mainState[page]
        }
      }
      ret[name] = theme
    }
    else if(name == 'fullScreen'){
      ret[name] = mainState.fullScreenIds[e.sender.id]
    }
    else if(name == 'isCustomChromium'){
      ret[name] = Browser.CUSTOM_CHROMIUM
    }
    else{
      ret[name] = mainState[name]
    }
  })

  e.sender.send(`get-main-state-reply_${key}`,ret)
})


ipcMain.on('save-state',async (e,{tableName,key,val})=>{
  if(tableName == 'state'){
    //   if(key == 'httpsEverywhereEnable'){
    //   require('../brave/httpsEverywhere')()
    // }
    // else if(key == 'trackingProtectionEnable'){
    //   require('../brave/trackingProtection')()
    // }
    // else if(key == 'noScript'){
    //   defaultConf.javascript[0].setting = val ? 'block' : 'allow'
    //   session.defaultSession.userPrefs.setDictionaryPref('content_settings', defaultConf)
    // }
    // else if(key == 'blockCanvasFingerprinting'){
    //   defaultConf.canvasFingerprinting[0].setting = val ? 'block' : 'allow'
    //   session.defaultSession.userPrefs.setDictionaryPref('content_settings', defaultConf)
    // }
    if(key == 'downloadPath'){
      if(fs.existsSync(val)) {
        app.setPath('downloads',val)
      }
      else{
        return
      }
    }
    else if(key == 'enableTheme'){
      const theme = extInfos[val] && extInfos[val].theme
      if(theme && theme.images){
        theme.sizes = {}
        for(let name of ['theme_toolbar','theme_tab_background']){
          if(!theme.images[name]) continue
          const file = path.join(theme.base_path,theme.images[name])
          if(file && fs.existsSync(file)){
            theme.sizes[name] = nativeImage.createFromPath(file).getSize()
          }
        }
      }
      for(let win of BrowserWindow.getAllWindows()) {
        if(win.getTitle().includes('Sushi Browser')){
          win.webContents.send('update-theme',theme)
        }
      }
    }
    mainState[key] = val
    state.update({ key: 1 }, { $merge: {info: {[key]: mainState[key], updated_at: Date.now()}}, $set: {updated_at: Date.now()} }).then(_=>_)
  }
  else{
    if(tableName　== "searchEngine"){
      const stateName = "searchProviders"
      mainState[stateName] = {}
      for(let ele of val){
        mainState[stateName][ele.name] = ele
      }
    }
    else{
      mainState[tableName] = val
    }

    const table = db[tableName]
    await table.remove({},{ multi: true })
    table.insert(val).then(_=>_)
  }

  if(tableName == "searchEngine" || key == "searchEngine"){
    e.sender.hostWebContents2.send("update-search-engine")
  }
  else{
    if(e.sender.hostWebContents2) e.sender.hostWebContents2.send("update-mainstate",key,val)
  }
})

ipcMain.on('menu-or-key-events',(e,name,...args)=>{
  getFocusedWebContents().then(cont=>{
    cont && cont.hostWebContents2.send('menu-or-key-events',name,cont.id,...args)
  })
})


if(isWin) {
  ipcMain.on('get-win-hwnd', async (e, key) => {
    const winctl = require('../resource/winctl')
    e.sender.send(`get-win-hwnd-reply_${key}`, winctl.GetActiveWindow2().getHwnd())
  })


  ipcMain.on('set-active', async (e, key, hwnd) => {
    const winctl = require('../resource/winctl')
    const aWin = winctl.GetActiveWindow2()
    const aWinHwnd = aWin.getHwnd()
    if(bindMap[key] === aWinHwnd){
      setTimeout(_=>{
        console.log('set-active')
        aWin.setWindowPos(winctl.HWND.BOTTOM,0,0,0,0,19+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE
      },100)
    }
  })

}

const restoredMap = {}
const hwndMap = {}
const bindMap = {}
ipcMain.on('set-pos-window',async (e,{id,hwnd,key,x,y,width,height,top,active,tabId,checkClose,restore})=>{

  if(!checkClose){
    console.log('set-pos-window',{id,hwnd,key,x,y,width,height,top,active,tabId,checkClose,restore})
  }

  const FRAME = parseInt(mainState.bindMarginFrame)
  const TITLE_BAR = parseInt(mainState.bindMarginTitle)
  if(isWin){
    let org
    if(hwnd){
      hwndMap[key] = hwnd
    }
    const winctl = require('../resource/winctl')
    const win = id ? (await winctl.FindWindows(win => id == win.getHwnd()))[0] : winctl.GetActiveWindow2()
    if(!id){
      const cn = win.getClassName()
      if(cn == 'Shell_TrayWnd' || cn == 'TaskManagerWindow' || cn == 'Progman' || cn == 'MultitaskingViewFrame' || win.getTitle().includes(' - Sushi Browser')){
        e.sender.send(`set-pos-window-reply_${key}`,(void 0))
        return
      }
      win.setWindowLongPtrRestore(0x800000)
      console.log('setWindowPos1')
      win.setWindowPos(0,0,0,0,0,39+1024)
      bindMap[key] = win.getHwnd()
    }

    if(restoredMap[key] !== (void 0)){
      clearTimeout(restoredMap[key])
      win.setWindowLongPtrRestore(0x800000)
      console.log('setWindowPos2')
      win.setWindowPos(0,0,0,0,0,39+1024);
      delete restoredMap[key]
    }

    if(restore){
      // console.log(32322,styleMap[key])
      win.setWindowLongPtr(0x800000)
      console.log('setWindowPos3')
      win.setWindowPos(0,0,0,0,0,39+1024);
      console.log('setWindowPos51',win.getTitle())
      const tid = setTimeout(_=>{
        // win.setWindowPos(winctl.HWND.NOTOPMOST,x||0,y||0,width||0,height||0,(x !== (void 0) ? 16 : 19)+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE
        // if(winctl.GetActiveWindow2().getHwnd() !== id){
        win.setWindowPos(winctl.HWND.BOTTOM,0,0,0,0,19+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE
        // }
      },100)
      restoredMap[key] = tid
      return
    }

    if(checkClose || !win){
      e.sender.send(`set-pos-window-reply_${key}`,checkClose ? {needClose:!win} : (void 0))
      if(!win) return
      const title = win.getTitle()
      for (let wc of getBindPage(tabId)) {
        wc.send('update-bind-title', title)
      }
      if(checkClose) return
    }

    if(top){
      if(x){
        x = scaling(x + FRAME / 2)
        y = scaling(y + TITLE_BAR + FRAME / 2)
        width = scaling(Math.max(0,width - FRAME))
        height = scaling(Math.max(0,height - (TITLE_BAR + FRAME)))
      }
      // console.log(top == 'above' ? winctl.HWND.TOPMOST : winctl.HWND.BOTTOM,x||0,y||0,width||0,height||0,(x !== (void 0) ? 16 : 19)+1024)

      if(top == 'above'){
        const cont = webContents.fromId(tabId)
        cont.bindWindow(true)
        console.log('setWindowPos4',win.getTitle())
        // win.setWindowPos(winctl.HWND.TOPMOST,x||0,y||0,width||0,height||0,(x !== (void 0) ? 16 : 19)+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE
        win.moveTop()
      }
      else{
        const cont = webContents.fromId(tabId)
        cont.bindWindow(false)
        console.log('setWindowPos5',win.getTitle()) //hatudouriyuu
        // win.setWindowPos(winctl.HWND.NOTOPMOST,x||0,y||0,width||0,height||0,(x !== (void 0) ? 16 : 19)+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE

        // if(winctl.GetActiveWindow2().getHwnd() !== id){
        //   win.setWindowPos(winctl.HWND.BOTTOM,0,0,0,0,19+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE
        // }
      }

    }
    else if(x + y + width + height !== 0){
      x = scaling(x + FRAME / 2)
      y = scaling(y + TITLE_BAR + FRAME / 2)
      width = scaling(Math.max(0,width - FRAME))
      height = scaling(Math.max(0,height - (TITLE_BAR + FRAME)))
      DpiUtils.move(win,x,y,width,height)
    }
    if(active) {
      // const win2 = winctl.GetActiveWindow2()
      // console.log('setWindowPos6',win.getTitle(),win2.getTitle())
      // win.moveTop
      // win.setWindowPos(winctl.HWND.TOPMOST,0,0,0,0,19+1024)
      // win.setWindowPos(winctl.HWND.NOTOPMOST,0,0,0,0,19+1024)
      // win2.setWindowPos(winctl.HWND.TOPMOST,0,0,0,0,19+1024)
      // win2.setWindowPos(winctl.HWND.NOTOPMOST,0,0,0,0,19+1024)
    }
    if(key) e.sender.send(`set-pos-window-reply_${key}`,[win.getHwnd(),win.getTitle()])
  }
  else if(isLinux){
    const i = id ? 'i' : ''
    id = id || ':ACTIVE:'

    if(restoredMap[key]){
      await exec(`wmctrl -v${i} -r ${id} -b add,above 2>&1`)
      delete restoredMap[key]
    }

    if(restore){
      restoredMap[key] = 1
    }
    if(checkClose){
      // const ret = (await exec(`wmctrl -l | grep ${id}`)).stdout
      // console.log(ret)
      // e.sender.send(`set-pos-window-reply_${key}`,{needClose:!ret})
      // if(ret){
      //   const title = ret.match(/[^ ]+ +[^ ]+ +[^ ]+ (.+)/)[1]
      //   for (let wc of getBindPage(tabId)) {
      //     wc.send('update-bind-title', title)
      //   }
      // }
      return
    }

    const commands = []
    if(id == ':ACTIVE:'){
      const ret = (await exec(`wmctrl -v -a :ACTIVE: 2>&1`)).stdout
      const mat = ret.match(/: *(0x[0-9a-f]+)/)
      const level = (await exec(`wmctrl -l | grep "${mat[1]}" 2>&1`)).stdout.match(/[^ ]+ +([^ ]+)/)[1]
      if(level == "-1"){
        e.sender.send(`set-pos-window-reply_${key}`)
        return
      }
      commands.push(`wmctrl -v${i} -r ${id} -b remove,maximized_vert,maximized_horz 2>&1`)
    }
    if(top){
      commands.push(`wmctrl -v${i} -r ${id} -b ${top == 'above' ? 'add,above' : 'remove,above'} 2>&1`)
    }
    if(x !== (void 0) && x + y + width + height !== 0){
      x = scaling(x + FRAME / 2)
      y = scaling(y + TITLE_BAR + FRAME / 2)
      width = scaling(Math.max(0,width - FRAME))
      height = scaling(Math.max(0,height - (TITLE_BAR + FRAME)))
      commands.push(`wmctrl -v${i} -r ${id} -e 0,${x},${y},${width},${height} 2>&1`)
    }

    let reply
    for(let command of commands){
      const ret = await exec(command)
      const id = ret.stdout.match(/: *(0x[0-9a-f]+)/)
      reply = id[1]
    }
    if(active) {
      const ret = await exec(`wmctrl -v -a :ACTIVE: 2>&1`)
      const mat = ret.stdout.match(/: *(0x[0-9a-f]+)/)
      await exec(`wmctrl -v${i} -a ${id} 2>&1`)
      await exec(`wmctrl -v${i} -a ${mat[1]} 2>&1`)
    }
    if(key){
      const name = (await exec(`wmctrl -l | grep "${reply}" 2>&1`)).stdout.match(/[^ ]+ +[^ ]+ +[^ ]+ (.+)/)[1]
      e.sender.send(`set-pos-window-reply_${key}`,[reply,name])
    }
  }
})

const mpoMap = {}, loopMap = {}, bwMap= {},tabMap = {}, loadMap = {}, detachMap = {}, winMap = {}
global.bwMap = bwMap
let mobileInject
ipcMain.on('mobile-panel-operation',async (e,{type, key, tabId, detach, url, x, y, width, height, oldKey, show, force})=>{
  console.log('mobile',{type, key, tabId, url, x, y, width, height, oldKey, detach})
  if(!mobileInject){
    mobileInject = fs.readFileSync(path.join(__dirname,"../resource/extension/default/1.0_0/js/mobilePanel.js").replace(/app.asar([\/\\])/,'app.asar.unpacked$1')).toString()
  }

  if(type == 'create'){

    //create window
    Browser.popuped = true

    const beforeTargets = await Browser._browser.targets()
    const targetIds = beforeTargets.map(t=>t._targetId)

    const cWin = await Browser.bg.evaluate((x,y,width,height) => {
      return new Promise(resolve => {
        chrome.windows.create({
          url: 'chrome-extension://dckpbojndfoinamcdamhkjhnjnmjkfjd/popup_prepare.html',
          left: Math.round(x),top: Math.round(y),width: Math.round(width),height: Math.round(height)
        }, window => resolve(window))
      })
    }, x,y,width,height)

    let chromeNativeWindow
    for(let i=0;i<100;i++){
      await new Promise(r=>setTimeout(r,500))

      //bind window
      chromeNativeWindow = (await winctl.FindWindows(win => {
        return win.getTitle().includes('Sushi Browser Popup Prepare')
      }))[0]
      if(chromeNativeWindow) break
    }


    //get target
    const tab = cWin.tabs[0]

    const mobileCont = new webContents(tab.id)
    const mobilePage = await mobileCont._getPage()

    let nativeWindow
    if(!detach){
      chromeNativeWindow.setForegroundWindowEx()
      console.log('setForegroundWindow6')
      chromeNativeWindow.showWindow(0)
      if(isWin7){
        chromeNativeWindow.setWindowLongPtrRestore(0x00800000)
        chromeNativeWindow.setWindowLongPtrRestore(0x00040000)
        chromeNativeWindow.setWindowLongPtrRestore(0x00400000)
      }
      chromeNativeWindow.setWindowLongPtrEx(0x00000080)
      chromeNativeWindow.showWindow(5)

      const hwnd = chromeNativeWindow.createWindow()
      nativeWindow = (await winctl.FindWindows(win => win.getHwnd() == hwnd))[0]

      chromeNativeWindow.setParent(nativeWindow.getHwnd())

      mobilePage.setViewport({width: Math.round(width), height: Math.round(height)})
      DpiUtils.move(nativeWindow,Math.round(x), Math.round(y), Math.round(width), Math.round(height))
      DpiUtils.move(chromeNativeWindow,...BrowserPanel.getChromeWindowBoundArray(Math.round(width), Math.round(height)))
    }

    mobileCont.loadURL(url)

    mpoMap[key] = {tab, mobileCont, mobilePage, nativeWindow, chromeNativeWindow}
    detachMap[key] = detach

    mobileCont.on('did-start-navigation', ()=>{

      const url = mobileCont.getURL()
      const tab = webContents.fromId(tabId)
      if(!tab) return
      if(url != tab.getURL()){
        const now = Date.now()
        const time = loadMap[`${key}_bw`]
        if(time && now - time < 1000) return

        tab.loadURL(url)
      }
    })

    mobileCont.on('destroyed',_=>{
      const tab = webContents.fromId(tabId)
      if(tab && tab.hostWebContents2) tab.hostWebContents2.send(`mobile-panel-close_${key}`)
    })

    bwMap[mobileCont.id] = tabId
    tabMap[tabId] = mobileCont

    loopMap[key] = setInterval(_=>{
      if(mobileCont.isDestroyed()) return
      mobileCont.send('mobile-scroll',{type:'init' ,code: mobileInject})

      const cont = webContents.fromId(tabId)
      if(cont && !cont.isDestroyed()) cont.send('mobile-scroll',{type:'init' ,code: mobileInject})
    },1000)

    chromeNativeWindow.setForegroundWindowEx()
    console.log('setForegroundWindow7')
    robot.keyTap('f12')

    await new Promise(r=> setTimeout(r,3000))

    const targets = await Browser._browser.targets();

    const devTarget = targets.find((target) => target.url().startsWith('chrome-devtools://devtools/bundled/devtools_app.html') && !targetIds.includes(target._targetId))

    const devPage = await devTarget.pageForce()

    await devPage.evaluate(async ()=>{
      let phoneButton
      for(let i=0;i<100;i++){
        await new Promise(r=>{
          setTimeout(_=>{
            try{
              phoneButton = document.querySelector('[slot="insertion-point-main"].vbox.flex-auto.tabbed-pane').shadowRoot.querySelector(".tabbed-pane-left-toolbar").shadowRoot.querySelector('.largeicon-phone').parentNode
            }catch(e){}
            r()
          },100)
        })
        if(phoneButton){
          if(phoneButton.classList.contains('toolbar-state-off')) phoneButton.click()
          phoneButton.parentNode.removeChild(phoneButton)
          break
        }
        Components.dockController.setDockSide('undocked')
      }
    })

    mobilePage.reload()
  }
  else{
    const {tab, mobileCont, mobilePage, nativeWindow, chromeNativeWindow} = mpoMap[key]
    const _detach = detachMap[key]
    if(!tab) return

    if(type == 'resize'){
      if(_detach) return
      console.log(x,y,width,height)
      mobilePage.setViewport({width: Math.round(width), height: Math.round(height)})
      DpiUtils.move(nativeWindow,Math.round(x), Math.round(y), Math.round(width), Math.round(height))
      DpiUtils.move(chromeNativeWindow,...BrowserPanel.getChromeWindowBoundArray(Math.round(width), Math.round(height)))
    }
    else if(type == 'url'){
      const thisUrl = mobileCont.getURL()
      if(url != thisUrl){
        const now = Date.now()
        const time = loadMap[`${key}_tab`]

        if(time && now - time < 1000) return
        loadMap[`${key}_bw`] = now
        mobileCont.loadURL(url)
      }
    }
    else if(type == 'close'){
      clearInterval(loopMap[key])
      if(!mobileCont.isDestroyed()){
        delete bwMap[mobileCont.id]
        mobileCont.destroy()
      }
      delete tabMap[tabId]
      delete detachMap[key]
      delete mpoMap[key]
      delete loopMap[key]
      delete winMap[key]
    }
    // else if(type == 'below'){
    //   if(_detach) return
    //   if(nativeWindow.isMinimized) return
    //   // if(isWin){
    //   //   const win = winMap[key]
    //   //   const winctl = require('winctl')
    //   //   win.setWindowPos(winctl.HWND.NOTOPMOST,x||0,y||0,width||0,height||0,(x !== (void 0) ? 16 : 19)+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE
    //   //   if(!bw.isFocused()) win.setWindowPos(winctl.HWND.BOTTOM,0,0,0,0,19+1024) // 19 = winctl.SWP.NOMOVE|winctl.SWP.NOSIZE|winctl.SWP.NOACTIVATE
    //   // }
    //   // else{
    //   bw.setAlwaysOnTop(false)
    //   // }
    //   console.log(66665555)
    //   if(force){
    //     const cont = webContents.fromId(tabId)
    //     cont.hostWebContents2.focus()
    //     console.log(666655556)
    //   }
    //   else if(show && !bw.isFocused()){
    //     console.log(666655557)
    //     bw.hide()
    //     bw.showInactive()
    //     bw.setSkipTaskbar(true)
    //   }
    // }
    else if(type == 'above'){
      if(_detach) return
      if(nativeWindow.isMinimized) return
      nativeWindow.moveTop()
    }
    else if(type == 'minimize'){
      if(_detach) return
      nativeWindow.showWindow(0)
      nativeWindow.isMinimized = true
    }
    else if(type == 'unminimize'){
      if(_detach || nativeWindow.hidePanel) return
      nativeWindow.showWindow(9)
      nativeWindow.isMinimized = false
      nativeWindow.setForegroundWindowEx()
      console.log('setForegroundWindow8')
    }
    else if(type == 'key-change'){
      mpoMap[key] = mpoMap[oldKey]
    }
    else if(type == 'detach'){
      detachMap[key] = detach

      if(detach){
        chromeNativeWindow.setParent(null)
        chromeNativeWindow.setWindowLongPtrExRestore(0x00000080)
        DpiUtils.move(chromeNativeWindow,Math.round(x), Math.round(y), Math.round(width), Math.round(height))
        nativeWindow.destroyWindow()
        setTimeout(()=>chromeNativeWindow.moveTop(),100)
      }
      else{
        chromeNativeWindow.setForegroundWindowEx()
        console.log('setForegroundWindow9')
        chromeNativeWindow.showWindow(0)
        if(isWin7){
          chromeNativeWindow.setWindowLongPtrRestore(0x00800000)
          chromeNativeWindow.setWindowLongPtrRestore(0x00040000)
          chromeNativeWindow.setWindowLongPtrRestore(0x00400000)
        }
        chromeNativeWindow.setWindowLongPtrEx(0x00000080)
        chromeNativeWindow.showWindow(5)

        const hwnd = chromeNativeWindow.createWindow()
        const nativeWindow = (await winctl.FindWindows(win => win.getHwnd() == hwnd))[0]
        mpoMap[key].nativeWindow = nativeWindow

        chromeNativeWindow.setParent(nativeWindow.getHwnd())

        // mobilePage.setViewport({width: Math.round(width), height: Math.round(height)})
        // nativeWindow.move(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
        // chromeNativeWindow.move(...BrowserPanel.getChromeWindowBoundArray(Math.round(width), Math.round(height)))

      }
      mainState.mobilePanelDetach = detach
    }
  }
})

ipcMain.on('sync-mobile-scroll',(e,optSelector,selector,move)=>{
  if(mainState.mobilePanelSyncScroll){
    const tabId = bwMap[e.sender.id]
    if(tabId){
      console.log('sync-mobile-scroll',optSelector,selector,e.sender.id,tabId,move)
      const tab = webContents.fromId(tabId)
      if(!tab.isDestroyed()) tab.send('mobile-scroll',{type: 'scroll', optSelector,selector,move})
    }
    else{
      console.log('sync-mobile-scroll2',optSelector,selector,e.sender.id,move)
      const cont = tabMap[e.sender.id]
      if(cont && !cont.isDestroyed()) cont.send('mobile-scroll',{type: 'scroll', optSelector,selector,move})
    }
  }
})

let timer,timers={}
ipcMain.on('change-tab-infos', (e,changeTabInfos, panelKey)=> {
  const f = function (cont,c) {
    // if (c.index !== (void 0)) {
    //   // if(timers[c.tabId]) clearTimeout(timers[c.tabId])
    //   // timers[c.tabId] = setTimeout(()=>{
    //   console.log('change-tab-infos', c)
    //   // cont.setTabIndex(c.index)
    //   ipcMain.emit('update-tab', null, c.tabId)
    //   // delete timers[c.tabId]
    //   // }, 10)
    // }
    if (c.active) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async() => {
        console.log('change-tab-infos', c)
        // ipcMain.emit('update-tab', null, c.tabId)
        // webContents.fromId(c.tabId).focus()
        if(panelKey){
          const [_1, _2, panel, _3] = BrowserPanel.getBrowserPanelByTabId(c.tabId)
          if(!panel || panel.panelKey != panelKey){
            await new Promise(r=>setTimeout(r,100))
            const [_1, _2, panel, _3] = BrowserPanel.getBrowserPanelByTabId(c.tabId)
            if(!panel || panel.panelKey != panelKey) return
          }
        }
        webContents.fromId(c.tabId).setActive()
        timer = void 0
      }, 10)
    }
  };
  for(let c of changeTabInfos){
    if(!c.tabId) continue
    let cont = sharedState[c.tabId] || webContents.fromId(c.tabId)
    if(cont) {
      f(cont,c)
    }
    else{
      let retry = 0
      const id = setInterval(_=>{
        if(retry++ > 100){
          clearInterval(id)
          return
        }
        cont = sharedState[c.tabId] || webContents.fromId(c.tabId)
        if(cont){
          f(cont,c)
          clearInterval(id)
        }
      },10)
    }
  }
})

// ipcMain.on('need-get-inner-text',(e,key)=>{
// if(mainState.historyFull){
//   ipcMain.once('get-inner-text',(e,location,title,text)=>{
//     historyFull.update({location},{location,title,text,updated_at: Date.now()}, { upsert: true }).then(_=>_)
//   })
// }
// e.sender.send(`need-get-inner-text-reply_${key}`,mainState.historyFull)
// })

ipcMain.on('play-external',(e,url)=> open(mainState.sendToVideo,url))

function headers(requestHeaders, userAgent, referer){
  if(!requestHeaders) return `--user-agent ${shellEscape(userAgent)} --referer ${shellEscape(referer)}`
  const arr = []
  for(const h of requestHeaders){
    arr.push(`--add-header ${h.name}:"${h.value || ''}"`)
  }
  return arr.join(" ")
}

function makePath(basePath,index){
  if(index === 0) return basePath
  const base = path.basename(basePath)
  const val = base.lastIndexOf('.')
  if(val == -1){
    return `${basePath} (${index})`
  }
  else{
    return path.join(path.dirname(basePath),`${base.slice(0,val)} (${index})${base.slice(val)}`)
  }
}

function getUniqFileName(basePath,index=0){
  const savePath = makePath(basePath,index)
  return fs.existsSync(savePath) ? getUniqFileName(basePath,index+1) : savePath
}

function dlM3u8(command, tabId, sender) {
  console.log(command)
  ipcMain.once('start-pty-reply', async (e, key) => {
    let cont
    for(let i=0;i<100;i++){
      cont = await getFocusedWebContents()
      const url = cont.getURL()
      if(url.startsWith('chrome-extension://dckpbojndfoinamcdamhkjhnjnmjkfjd/terminal.html')) break
      await new Promise(r=>setTimeout(r,30))
    }

    ipcMain.emit('send-input-event', {} , {type: 'mouseDown',tabId: cont.id,x:100,y:100,button: 'left'})
    ipcMain.emit('send-input-event', {} , {type: 'mouseUp',tabId: cont.id,x:100,y:100,button: 'left'})
    await new Promise(r=>setTimeout(r,100))
    ipcMain.emit(`send-pty_${key}`, null, command)
  })
  sender.send('new-tab', tabId, 'chrome-extension://dckpbojndfoinamcdamhkjhnjnmjkfjd/terminal.html?cmd=1')
}

ipcMain.on('download-m3u8',async (e,url,fname,tabId,userAgent,referer,needInput,requestHeaders)=>{
  const ffmpeg = path.join(__dirname, `../resource/bin/ffmpeg/${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}/ffmpeg${process.platform === 'win32' ? '.exe' : ''}`).replace(/app.asar([\/\\])/,'app.asar.unpacked$1')
  const youtubeDl = path.join(__dirname,'../node_modules/youtube-dl/bin/youtube-dl').replace(/app.asar([\/\\])/,'app.asar.unpacked$1')
  const downloadPath = app.getPath('downloads')
  let saveFileName = fname.split(".").slice(0,-1).join(".")

  if(fname == 'playback.m3u8' && url.match(/[^a-z]playback.[^\/]{300}/)){
    const data = await new Promise(r=> new webContents(tabId).executeJavaScript((url) => new Promise(r => fetch(url).then(res=>r(res.text()))), null, r, url))
    let name = referer ? URL.parse(referer).path.split("/").reverse()[0] : uuid.v4().replace(/\\-/g, '')
    try { name = decodeURIComponent(name) } catch (e) {}

    const m3u8Path = getUniqFileName(path.join(downloadPath, `${name}.m3u8`))
    const m3u8Contents = Buffer.from(data, 'base64').toString('utf-8')
    fs.writeFileSync(m3u8Path, m3u8Contents)

    url = `http://localhost:${Browser.port}/?key=${Browser.serverKey}&file=${`file://${m3u8Path.replace(/\\/g,'/')}`}`
    saveFileName = name
  }

  let savePath = path.join(downloadPath,`${saveFileName}.%(ext)s`)
  const getCommand = (savePath) => `${shellEscape(youtubeDl)} ${headers(requestHeaders, userAgent, referer)} --ffmpeg-location=${shellEscape(ffmpeg)} -o ${shellEscape(savePath)} ${shellEscape(url)}\n`

  if(needInput){
    dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender),{defaultPath: savePath },filepath=>{
      if (!filepath) return
      savePath = filepath
      dlM3u8(getCommand(savePath), tabId, e.sender)
    })
  }
  else{
    dlM3u8(getCommand(savePath), tabId, e.sender)
  }
})

let numVpn = 1
ipcMain.on('vpn-event',async (e,key,address)=>{
  if(mainState.vpn || !address){
    const ret2 = await exec(`rasdial /disconnect`)
    console.log(ret2)
    mainState.vpn = (void 0)
    e.sender.send('vpn-event-reply')
  }

  if(!address || !address.match(/^[a-zA-Z\d.\-_:]+$/)) return
  const name = address.split(".")[0]
  try{
    numVpn = (numVpn + 1) % 2
    const ret = await exec(`powershell "Set-VpnConnection -Name sushib-${numVpn} -ServerAddress ${address} -TunnelType Sstp -AuthenticationMethod MsChapv2"`)
    console.log(ret)
  }catch(e2){
    console.log(e2)
    try{
      const ret = await exec(`powershell "Add-VpnConnection -Name sushib-${numVpn} -ServerAddress ${address} -TunnelType Sstp -AuthenticationMethod MsChapv2"`)
      console.log(ret)
    }catch(e3){
      console.log(e3)
    }
  }
  try{
    const ret2 = await exec(`rasdial sushib-${numVpn} vpn vpn`)
    e.sender.send('show-notification',{key,text:'VPN connection SUCCESS', buttons:['OK']})
    console.log(ret2)
    mainState.vpn = name
  }catch(e2){
    e.sender.send('show-notification',{key,text:'VPN connection FAILED', buttons:['OK']})
  }
  e.sender.send('vpn-event-reply')

})

ipcMain.on('audio-extract',e=>{
  const focusedWindow = Browser.getFocusedWindow()
  dialog.showOpenDialog(focusedWindow,{
    properties: ['openFile', 'multiSelections'],
    name: 'Select Video Files',
    filters: [
      {name: 'Media Files', extensions: ['3gp','3gpp','3gpp2','asf','avi','dv','flv','m2t','m4v','mkv','mov','mp4','mpeg','mpg','mts','oggtheora','ogv','rm','ts','vob','webm','wmv']},
      {name: 'All Files', extensions: ['*']}
    ]
  },async files=>{
    if (files && files.length > 0) {
      for(let fileList of eachSlice(files,6)){
        const promises = []
        for(let file of fileList){
          const key = Math.random().toString()
          promises.push(new Promise((resolve)=>{
            new FfmpegWrapper(file).exe(resolve)
          }))
        }
        await Promise.all(promises)
      }
    }
  })
})

ipcMain.on('get-country-names',e=>{
  const locale = app.getLocale()
  let i = 0
  let base
  for(let line of fs.readFileSync(path.join(__dirname,'../resource/country.txt')).toString().split("\n")){
    if(i++===0){
      base = line.split("\t").slice(1)
    }
    if(line.startsWith(locale)){
      const ret = {}
      line.split("\t").slice(1).forEach((x,i)=>{
        ret[base[i]] = x
      })
      console.log(ret)
      e.sender.send('get-country-names-reply',ret)
      break
    }
  }
})

let prevCount = {}
ipcMain.on('get-on-dom-ready',async (e,tabId,tabKey,rSession,closingPos)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  if(!cont || cont.isDestroyed()){
    e.sender.send(`get-on-dom-ready-reply_${tabId}`,null)
    return
  }
  await saveTabState(cont, rSession, tabKey, void 0, closingPos)
  //if(mainState.flash) cont.authorizePlugin(mainState.flash) @TODO ELECTRON

  let currentEntryIndex,entryCount = await cont.length()
  if(rSession){
    if(entryCount > (prevCount[tabKey] || 1)){
      currentEntryIndex = rSession.currentIndex + 1
      entryCount = rSession.currentIndex + 2
    }
    else{
      currentEntryIndex = rSession.currentIndex
      entryCount = rSession.urls.length
    }
  }
  else{
    currentEntryIndex = await cont.getActiveIndex()
  }

  e.sender.send(`get-on-dom-ready-reply_${tabId}`,{currentEntryIndex,entryCount,title: await cont.getTitle(),rSession})
})

ipcMain.on('tab-close-handler',(e,tabId,tabKey,rSession,closingPos)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  if(!cont || cont.isDestroyed()) return
  saveTabState(cont, rSession, tabKey, void 0, closingPos, 1)
})

ipcMain.on('get-update-title',async (e,tabId,tabKey,rSession,closingPos)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  if(!cont || cont.isDestroyed()){
    e.sender.send(`get-update-title-reply_${tabId}`,null)
    return
  }
  await saveTabState(cont, rSession, tabKey, void 0, closingPos)

  let currentEntryIndex,entryCount = await cont.length()
  if(rSession){
    if(entryCount > (prevCount[tabKey] || 1)){
      currentEntryIndex = rSession.currentIndex + 1
      entryCount = rSession.currentIndex + 2
    }
    else{
      currentEntryIndex = rSession.currentIndex
      entryCount = rSession.urls.length
    }
  }
  else{
    currentEntryIndex = await cont.getActiveIndex()
  }

  const url = cont.getURL()
  const ret = cont ? {
    title: await cont.getTitle(),
    currentEntryIndex,
    entryCount,
    url,
    rSession
  } : null

  e.sender.send(`get-update-title-reply_${tabId}`,ret)
  visit.insert({url,created_at:Date.now()})
})

ipcMain.on('get-did-finish-load',async (e,tabId,tabKey,rSession)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  if(!cont || cont.isDestroyed()){
    e.sender.send(`get-did-finish-load-reply_${tabId}`,null)
    return
  }

  let currentEntryIndex,entryCount = await cont.length()
  if(rSession){
    if(entryCount > (prevCount[tabKey] || 1)){
      currentEntryIndex = rSession.currentIndex + 1
      entryCount = rSession.currentIndex + 2
      console.log(77,currentEntryIndex,entryCount)
    }
    else{
      currentEntryIndex = rSession.currentIndex
      entryCount = rSession.urls.length
      console.log(78,currentEntryIndex,entryCount)
    }
  }
  else{
    currentEntryIndex = await cont.getActiveIndex()
  }

  const ret = cont ? {
    currentEntryIndex,
    entryCount,
    url: cont.getURL(),
    title: await cont.getTitle()
  } : null

  e.sender.send(`get-did-finish-load-reply_${tabId}`,ret)
})

const destroyedMap = new Map()
function addDestroyedFunc(cont,tabId,sender,msg){
  if(destroyedMap.has(tabId)){
    const arr = destroyedMap.get(tabId)
    arr.push([sender,msg])
  }
  else{
    destroyedMap.set(tabId,[[sender,msg]])
    cont.once('destroyed',_=>{
      for(let [sender,msg] of destroyedMap.get(tabId)){
        if(!sender.isDestroyed()) sender.send(msg,'destroy')
      }
    })
  }
}

ipcMain.on('get-did-start-loading',(e,tabId)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  const msg = `get-did-start-loading-reply_${tabId}`
  if(!cont || cont.isDestroyed()){
    e.sender.send(msg)
    return
  }
  addDestroyedFunc(cont,tabId,e.sender,msg)
  cont.on('did-start-loading',e2=> {
    e.sender.send(msg,true)
  })
})

// ipcMain.on('get-did-stop-loading',(e,tabId)=>{
//   const cont = (sharedState[tabId] || webContents.fromId(tabId))
//   const msg = `get-did-stop-loading-reply_${tabId}`
//   if(!cont){
//     e.sender.send(msg)
//     return
//   }
//   addDestroyedFunc(cont,tabId,e.sender,msg)
//   cont.on('did-stop-loading',e2=> {
//     const ret = {
//       currentEntryIndex: cont.getCurrentEntryIndex(),
//       entryCount: cont.getEntryCount(),
//       url: cont.getURL()
//     }
//     e.sender.send(msg, ret)
//   })
// })


const detachTabs = []
ipcMain.on('detach-tab',(e,tabId)=>{
  const cont = webContents.fromId(tabId)
  detachTabs.push([e.sender,tabId,cont.getURL()])
  cont._detachGuest()
})


// const preCloseTabs = []
// ipcMain.on('close-tab-pretask',(e,tabId)=>{
//   const cont = webContents.fromId(tabId)
//   if(cont){
//     cont._detachGuest()
//   }
// })

PubSub.subscribe("web-contents-created",(msg,[tabId,sender])=>{
  console.log("web-contents-created",tabId)
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  if(!cont || cont.isDestroyed()) return
  console.log("web-contents-created",tabId,cont.guestInstanceId,cont.getURL())

  // if(!sender.isDestroyed()) sender.send('web-contents-created',tabId)

  if(detachTabs.length){
    console.log(5483543,detachTabs)
    const ind = detachTabs.findIndex(t=>{
      return t[2] == cont.getURL()
    })
    if(ind !== -1){
      detachTabs[ind][0].send(`detach-tab_${detachTabs[ind][1]}`,tabId)
      detachTabs.splice(ind, 1)
      return
    }
  }
  // if(preCloseTabs.length){
  //   const ind = preCloseTabs.findIndex(t=>{
  //     return t == cont.getURL()
  //   })
  //   if(ind !== -1){
  //     console.log('discard',cont.getURL())
  //     const cont2 = webContents.fromId(tabId)
  //     cont2.forceClose()
  //     preCloseTabs.splice(ind, 1)
  //     return
  //   }
  // }

  cont.on('page-title-updated',e2=> {
    if(!sender.isDestroyed()) sender.send('page-title-updated',tabId)
  })

})

ipcMain.on('get-navbar-menu-order',e=>{
  e.returnValue = mainState.navbarItems
})

async function setTabState(cont,cb){
  const tabId = cont.id
  const openerTabId = (await new webContents(tabId)._getTabInfo()).openerTabId
  const requestId = Math.random().toString()
  const hostWebContents = await cont.getHostWebContents2Aasync()
  hostWebContents.send('CHROME_TABS_TAB_VALUE', requestId, tabId)
  ipcMain.once(`CHROME_TABS_TAB_VALUE_RESULT_${requestId}`,(event, tabValue)=>{
    cb({id:tabId, openerTabId, index:tabValue.index, windowId:BrowserWindow.fromWebContents(hostWebContents).id,active:tabValue.active,pinned:tabValue.pinned})
  })
}

async function saveTabState(cont, rSession, tabKey, noUpdate, closingPos, close) {
  closingPos = closingPos || {}

  let histNum = await cont.length(),
    currentIndex = await cont.getActiveIndex(),
    historyList = []
  const urls = [], titles = [], positions = []
  if (!rSession) {
    for (let i = 0; i < histNum; i++) {
      const url = await cont.getURLAtIndex(i)
      const title = await cont.getTitleAtIndex(i)
      const pos = closingPos[url] || ""
      urls.push(url)
      titles.push(title)
      positions.push(pos)
      historyList.push([url, title, pos])
    }
    if (currentIndex > -1 && !noUpdate) {
      setTabState(cont,vals => tabState.update({tabKey}, {...vals ,tabKey,titles: titles.join("\t"),urls: urls.join("\t"),positions:JSON.stringify(positions),currentIndex, close, updated_at: Date.now() }, {upsert: true}))
    }
  }
  else {
    console.log(998,histNum > (prevCount[tabKey] || 1),currentIndex == histNum - 1,rSession.urls)
    if (histNum > (prevCount[tabKey] || 1) && currentIndex == histNum - 1) {
      const url = await cont.getURLAtIndex(currentIndex)
      const title = await cont.getTitleAtIndex(currentIndex)
      const pos = closingPos[url] || ""
      rSession.urls = rSession.urls.slice(0, rSession.currentIndex + 1)
      rSession.titles = rSession.titles.slice(0, rSession.currentIndex + 1)
      rSession.positions = rSession.positions.slice(0, rSession.currentIndex + 1)
      if(rSession.urls[rSession.urls.length-1] != url){
        rSession.urls.push(url)
        rSession.titles.push(title)
        rSession.positions.push(pos)
      }
      rSession.currentIndex = rSession.urls.length - 1
      if (currentIndex > -1 && !noUpdate) {
        setTabState(cont,vals => tabState.update({tabKey}, {$set: {...vals , titles: rSession.titles.join("\t"),urls: rSession.urls.join("\t"),positions:JSON.stringify(positions),currentIndex: rSession.currentIndex,updated_at: Date.now() } }))
      }
    }
    if (currentIndex > -1 && !noUpdate) {
      setTabState(cont,vals => tabState.update({tabKey}, {$set: {...vals ,currentIndex: rSession.currentIndex, updated_at: Date.now()}}))
    }
    historyList = rSession.urls.map((x, i) => [x, rSession.titles[i], rSession.positions[i]])
    currentIndex = rSession.currentIndex
  }
  if(!noUpdate) prevCount[tabKey] = histNum
  return {currentIndex, historyList}
}

ipcMain.on('get-cont-history',async (e,tabId,tabKey,rSession)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  if(!cont || cont.isDestroyed()){
    e.sender.send(`get-cont-history-reply_${tabId}`)
    return
  }
  let {currentIndex, historyList} = await saveTabState(cont, rSession, tabKey, true);
  e.sender.send(`get-cont-history-reply_${tabId}`,currentIndex,historyList,rSession,mainState.adBlockEnable,mainState.pdfMode,mainState.navbarItems)
})
ipcMain.on('get-session-sequence',(e,isPrivate)=> {
  e.returnValue = seq(isPrivate)
})

ipcMain.on('menu-or-key-events-main',(e,msg,tabId)=>{
  e.sender.send('menu-or-key-events',msg,tabId)
})

ipcMain.on('show-notification-sort-menu',(e,key,tabId)=>{
  e.sender.send('show-notification',{key,text:'End sorting the menu?', buttons:['OK']})
  ipcMain.once(`reply-notification-${key}`,(e,ret)=>{
    e.sender.send(`show-notification-sort-menu-reply_${key}`)
  })
})

ipcMain.on('get-extension-info',(e,key)=>{
  e.sender.send(`get-extension-info-reply_${key}`,extInfos)
})

ipcMain.on('get-sync-main-states',(e,keys,noSync,url)=>{
  const result = keys.map(key=>{
    if(key == 'inputsVideo'){
      const ret = {}
      for(let [key,val] of Object.entries(mainState)){
        if(key.startsWith('keyVideo')){
          for(let v of val){
            if(!v) continue
            const e = toKeyEvent(v)
            const val2 = e.key ? {key: e.key} : {code: e.code}
            if(e.ctrlKey) val2.ctrlKey = true
            if(e.metaKey) val2.metaKey = true
            if(e.shiftKey) val2.shiftKey = true
            if(e.altKey) val2.altKey = true
            let key2 = key.slice(8)
            ret[JSON.stringify(val2)] = `${key2.charAt(0).toLowerCase()}${key2.slice(1)}`
          }
        }
        else if(key.endsWith('Video')){
          ret[key.slice(0,-5)] = val
        }
        else if(key.startsWith('regexKeyVideo')){
          ret[`regex${key.slice(13)}`] = val
        }
        else if(key == 'showCurrentTime'){
          ret[key] = val
        }
      }
      return ret
    }
    else if(key == 'themeInfo'){
      const theme = extInfos[mainState.enableTheme] && extInfos[mainState.enableTheme].theme
      if(!theme) return
      if(theme.images){
        if(!theme.sizes){
          theme.sizes = {}
          for(let name of ['theme_toolbar','theme_tab_background']){
            if(!theme.images[name]) continue
            const file = path.join(theme.base_path,theme.images[name])
            if(file && fs.existsSync(file)){
              theme.sizes[name] = nativeImage.createFromPath(file).getSize()
            }
          }
        }
        if(!theme.datas){
          theme.datas = {}
          for(let name of ['theme_ntp_background','theme_ntp_attribution']){
            if(!theme.images[name]) continue
            const file = path.join(theme.base_path,theme.images[name])
            if(file && fs.existsSync(file)){
              theme.datas[name] = nativeImage.createFromPath(file).toDataURL()
            }
          }
        }
      }
      return theme
    }
    else if(key == 'isCustomChromium'){
      console.log(key,Browser.CUSTOM_CHROMIUM)
      return Browser.CUSTOM_CHROMIUM
    }
    else{
      return mainState[key]
    }
  })

  if(noSync){
    if(keys[0] == 'inputsVideo'){
      videoController.find({url: {$in: ['_default_', url]}}).then(rec => {
        let def, target
        for(const vc of rec){
          if(vc.url == '_default_'){
            def = vc
          }
          else{
            target = vc
          }
        }

        result[0].videoController = def && target ? {...def, ...target} : target || def
        e.sender.send(`get-sync-main-states-reply_${noSync}`, result)
      })
    }
    else{
      e.sender.send(`get-sync-main-states-reply_${noSync}`, result)
    }
  }
  else{
    e.returnValue = result
  }

})

ipcMain.on('get-sync-main-state',(e,key)=>{
  e.returnValue = mainState[key] || null
})

ipcMain.on('get-sync-rSession',(e,keys)=>{
  tabState.find({tabKey:{$in:keys || []}}).then(rec=>{
    const ret = []
    for(const key of keys){
      const x = rec.find(c=> c.tabKey == key)
      if(x) ret.push(x)
    }
    e.returnValue = ret
  })
})

ipcMain.on('set-clipboard',(e,data)=>{
  clipboard.writeText(data.join(os.EOL))
})


ipcMain.on('download-start',(e, url, fileName)=>{
  if(fileName){
    ipcMain.emit('noneed-set-save-filename',null,url)
    ipcMain.emit('set-save-path', null, url,fileName,true)
  }

  try{
    e.sender.downloadURL(url)
  }
  catch(e){
    Browser.downloadURL(url)
  }
})

ipcMain.on('print-to-pdf',(e,key,tabId,savePath,options)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  if(!path.isAbsolute(savePath)){
    savePath = path.join(app.getPath('desktop'),savePath)
  }

  if(cont && !cont.isDestroyed()) cont.printToPDF(options, (error, data) => {
    fs.writeFile(savePath, data, (error) => {
      e.sender.send(`print-to-pdf-reply_${key}`)
    })
  })
})

ipcMain.on('open-update-cmd',e=>{
  shell.showItemInFolder(path.join(__dirname, '../../../update.cmd'))
})

ipcMain.on('screen-shot',(e,{full,type,rect,tabId,tabKey,quality=92,savePath,autoPlay})=>{
  const capture = (cb,image)=>{
    if(cb) cb()
    if(type == 'clipboard'){
      clipboard.writeImage(image)
    }
    else{
      const isJpeg = type == 'JPEG'
      let writePath
      if(savePath){
        if(path.isAbsolute(savePath)){
          writePath = savePath
        }
        else{
          writePath = path.join(app.getPath('desktop'),savePath)
        }
      }
      else{
        writePath = path.join(app.getPath('desktop'),`screenshot-${formatDate(new Date())}.${isJpeg ? 'jpg' : 'png'}`)
      }
      fs.writeFile(writePath,isJpeg ? image.toJPEG(quality) : image.toPNG(),_=>{
        if(autoPlay){
          e.sender.send(`screen-shot-reply_${tabId}`)
        }
        else{
          shell.showItemInFolder(writePath)
        }
      })
    }
  }

  const cont = (e.sender.hostWebContents2 ?  e.sender : (sharedState[tabId] || webContents.fromId(tabId)))
  if(cont && !cont.isDestroyed()) cont.capturePage(rect, capture.bind(this,null), void 0, full)

})

ipcMain.on('save-and-play-video',(e,url,win,requestHeaders)=>{
  win = win || BrowserWindow.fromWebContents(e.sender)
  Browser.downloadURL(url, void 0, requestHeaders)
  let retry = 0
  const id = setInterval(_=>{
    if(retry++ > 1000){
      clearInterval(id)
      return
    }
    const item = global.downloadItems.find(x=>x.orgUrl == url)
    if(item && (item.percent > 0 || (item.aria2c && item.aria2c.processed / item.aria2c.total > 0.005))){
      clearInterval(id)
      shell.openExternal(`file://${item.savePath}`)
    }
  },100)
})

ipcMain.on('execCommand-copy',e=>{
  console.log(888948848)
  e.sender.sendInputEvent({type: 'keyDown', keyCode: 'c', modifiers: ['control']});
  e.sender.sendInputEvent({type: 'keyUp', keyCode: 'c', modifiers: ['control']});
})

ipcMain.on('get-isMaximized',e=>{
  const win = BrowserWindow.fromWebContents(e.sender)
  e.returnValue = win && !win.isDestroyed() ? (win.isMaximized() || win._isFullScreen) : void 0
})

ipcMain.on('set-audio-muted',(e,tabId,val,changeTabPanel)=>{
  const cont = webContents.fromId(tabId)
  if(cont && !cont.isDestroyed()) cont.setAudioMuted(val)
  if(changeTabPanel){

    for(let win of BrowserWindow.getAllWindows()) {
      if(win.getTitle().includes('Sushi Browser')){
        win.webContents.send('chrome-tabs-event',{tabId,changeInfo:{muted: val}},'updated')
      }
    }
  }

})

ipcMain.on('get-automation',async e=>{
  const datas = await automation.find({})
  e.sender.send('get-automation-reply',datas)
})

ipcMain.on('update-automation',(e,key,ops)=>{
  automation.update({key},{key, ops, updated_at: Date.now()}, { upsert: true }).then(_=>_)
})

ipcMain.on('update-automation-order',async (e,datas,menuKey)=>{
  await automationOrder.remove({})
  const key = '1'
  automationOrder.update({key},{key, datas, menuKey, updated_at: Date.now()}, { upsert: true }).then(_=>_)
})

ipcMain.on('get-automation-order',async (e,key)=>{
  const rec = await automationOrder.findOne({})
  e.sender.send(`get-automation-order-reply_${key}`, rec ? {datas:rec.datas, menuKey:rec.menuKey} : {datas:[]})
})

ipcMain.on('delete-automation',async (e,key)=>{
  await automation.remove({key})
  await automationOrder.remove({key})
})

ipcMain.on('run-puppeteer',(e, dir, file)=> {
  ipcMain.once('start-pty-reply', (e, key) => {
    ipcMain.emit(`send-pty_${key}`, null, `cd ${dir}\nnode ${file}\n`)
  })
  e.sender.hostWebContents2.send('new-tab', e.sender.id, 'chrome-extension://dckpbojndfoinamcdamhkjhnjnmjkfjd/terminal.html?cmd=1')
})

ipcMain.on('start-complex-search',(e,key,tabId,operation,noMacro)=>{
  const macro = noMacro ? '' : readComplexSearch()
  const cont = webContents.fromId(tabId)
  if(cont && !cont.isDestroyed()){
    cont.executeJavaScript(`${macro}\n${operation}`, (result)=>{
      e.sender.send(`start-complex-search-reply_${key}`,result)
    })
  }
})

ipcMain.on('start-find-all',async (e,key,tabIds,operation,noMacro)=>{ //@TODO
  const macro = noMacro ? '' : readFindAll()
  const code = `${macro}\n${operation}`
  const promises = []
  for(let tabId of tabIds){
    promises.push(new Promise(r=>{
      const cont = webContents.fromId(tabId)
      if(cont && !cont.isDestroyed()){
        cont.executeJavaScript(code, (result)=>{
          r([tabId,result])
        })
      }
    }))
  }

  e.sender.send(`start-find-all-reply_${key}`,await Promise.all(promises))
})

ipcMain.on('history-count-reset',async (e,key,_id,count)=>{
  const ret = await history.findOne({_id})
  await history.update({_id}, {$set:{count}})
  e.sender.send(`history-count-reset-reply_${key}`,ret.count)
})

ipcMain.on('history-pin',async (e,key,_id,val)=>{
  let max = -1
  if(!val){
    await history.update({_id}, {$unset:{pin: true}})
  }
  else{
    for(let rec of (await history.find({pin: {$ne: null}}))){
      max = Math.max(rec.pin, max)
    }
    await history.update({_id}, {$set:{pin: max+1}})
  }
  e.sender.send(`history-pin-reply_${key}`,max+1)
})

ipcMain.on('remove-history',async (e,val)=> {
  const opt = val.all ? {} :
    val.date ? {updated_at:{ $gte: Date.parse(`${val.date.replace(/\//g,'-')} 00:00:00`) ,$lte: Date.parse(`${val.date.replace(/\//g,'-')} 00:00:00`) + 24 * 60 * 60 * 1000 }} :
      {_id: val._id}
  history.remove(opt, { multi: true })
})

ipcMain.on('quit-browser',(e,type)=>{
  ipcMain.emit('save-all-windows-state',null,'quit')
  ipcMain.once('wait-saveState-on-quit',()=>{
    if(type == 'restart'){
      app.relaunch()
    }
    BrowserWindow.getAllWindows().forEach(win=>win.close())
    app.quit()
  })
})

ipcMain.on('close-window',e=>{
  BrowserWindow.fromWebContents(e.sender.webContents).close()
})

ipcMain.on('find-event',(e,tabId,method,...args)=>{
  if(!method.includes('find') && !method.includes('Find')) return
  const cont = webContents.fromId(tabId)
  if(cont && !cont.isDestroyed()){
    cont[method](...args)
  }
})

ipcMain.on('visit-timer',(e,type)=>{
  for(let win of BrowserWindow.getAllWindows()) {
    if(win.getTitle().includes('Sushi Browser')){
      win.webContents.send('visit-state-update',type)
    }
  }
})

ipcMain.on('browser-load',async (e,arg)=>{
  const win = await BrowserWindowPlus.load(arg)
  e.returnValue = win.id
})

ipcMain.on('get-shared-state-main',async (e,id)=>{
  e.returnValue = require('./sharedStateMainRemote')(id)
})

ipcMain.on('rectangular-selection',(e,val)=>{
  mainState.rectSelection = val ? [e.sender,val] : void 0
  if(val) require('./menuSetting').updateMenu()
})


ipcMain.on("full-screen-html",(e,val)=>{
  mainState.fullScreenIds[e.sender.id] = val
})

// ipcMain.on("login-sync",async (e,{key,type,email,password})=>{
//   const firebaseUtils = require('./FirebaseUtils')
//   let errMsg,msg
//   if(type == 'login'){
//     msg = 'Login'
//     errMsg = await firebaseUtils.login(email,password)
//   }
//   else if(type == 'logout'){
//     msg = 'Logout'
//     errMsg = await firebaseUtils.logout(email)
//   }
//   else if(type == 'regist'){
//     msg = 'User registration'
//     errMsg = await firebaseUtils.regist(email,password)
//   }
//   e.sender.send(`login-sync-reply_${key}`,!errMsg, errMsg || `${msg} succeeded!`)
// })

function recurMenu(template,cont){
  for(let item of template){
    if(item.submenu){
      recurMenu(item.submenu,cont)
    }
    else if(item.id){
      item.click = ()=>{
        cont.executeJavascriptInDevTools(`(function(){window.DevToolsAPI.contextMenuItemSelected(${item.id});window.DevToolsAPI.contextMenuCleared()}())`)
      }
    }
  }
}

ipcMain.on("devTools-contextMenu-open",(e,template,x,y)=>{
  const cont = e.sender
  console.log(template)
  const targetWindow = BrowserWindow.fromWebContents(cont.hostWebContents2 || cont)
  if (!targetWindow) return

  if(template.length){
    recurMenu(template,cont)
  }
  else{
    template.push({label: locale.translation("cut"), role: 'cut'})
    template.push({label: locale.translation("copy"), role: 'copy'})
    template.push({label: locale.translation("paste"), role: 'paste'})
  }
  Menu.buildFromTemplate(template).popup(targetWindow)
})

ipcMain.on("menu-command",(e,name)=>{
  const templates = require('./menuSetting').getTemplate()
  let flag
  for(let template of templates){
    for(let menu of template.submenu){
      console.log(222,menu,name)
      if(name == menu.label || locale.translation(name) == menu.label ){
        console.log(menu,name)
        if(menu.click){
          menu.click(null,getCurrentWindow())
        }
        else{
          getFocusedWebContents(true).then(cont=>{
            if(menu.role == 'selectall') menu.role = 'selectAll'
            cont && cont[menu.role]()
          })
        }
        flag = true
        break
      }
    }
    if(flag) break
  }
})

ipcMain.on('set-zoom',(e,tabId,factor)=>{
  const cont = (sharedState[tabId] || webContents.fromId(tabId))
  cont.setZoomFactor(factor)
})


ipcMain.on('get-vpn-list',(e,key)=> {
  request({url: `https://sushib.me/vpngate.json?a=${Math.floor(Date.now() / 1000 / 1800)}`}, (err, response, text) => {
    e.sender.send(`get-vpn-list-reply_${key}`, text)
  })
})


// ipcMain.on('fetch-style',(e, key, url)=> {
//   visitedStyle.findOne({url}).then(result => {
//     if(result){
//       e.sender.send(`fetch-style-reply_${key}`, result.text)
//     }
//     else{
//       request({url}, (err, response, text) => {
//         e.sender.send(`fetch-style-reply_${key}`, text)
//         visitedStyle.insert({url, text})
//       })
//     }
//   })
// })

ipcMain.on('get-selector-code',(e,key)=>{
  const code = fs.readFileSync(path.join(__dirname,"../resource/extension/default/1.0_0/js/mobilePanel.js").replace(/app.asar([\/\\])/,'app.asar.unpacked$1')).toString()
  e.sender.send(`get-selector-code_${key}`,code)
})

ipcMain.on('input-history-data',async (e,key,data,isTmp)=>{
  if(isTmp){
    const d = await inputHistory.findOne({host: data.host, value:data.value})
    if(!d){
      data.key = key
      await inputHistory.update({key}, data, { upsert: true })
    }
  }
  else{
    await inputHistory.remove({key})
    await inputHistory.update({host: data.host, value:data.value}, data, { upsert: true })
  }
})

ipcMain.on('focus-input',async (e,mode,data)=>{
  if(!isWin) return

  const hostWebContents = e.sender.hostWebContents2
  if(!hostWebContents) return
  if(mode == 'in'){
    const inHistory = await inputHistory.find({host: data.host})
    if(inHistory && inHistory.length){
      hostWebContents.send('focus-input',{mode,tabId: e.sender.id,...data,inHistory})
    }
  }
  else{
    hostWebContents.send('focus-input',{mode,tabId: e.sender.id,...data})
  }
})

ipcMain.on('get-input-history',async (e,key)=>{
  const data = await inputHistory.find_sort([{}],[{ now: -1 }])
  e.sender.send(`get-input-history-reply_${key}`,data)
})

ipcMain.on('delete-input-history',async (e,cond)=>{
  await inputHistory.remove(cond, { multi: true })
})

ipcMain.on('main-state-op',(e,op,name,key,val)=>{
  console.log('main-state-op',op,name,key,val)
  if(op == 'get'){
    e.returnValue = mainState[name]
  }
  else if(op == 'set'){
    mainState[op](name,val)
  }
  else if(op == 'add'){
    mainState[op](name,key,val)
  }
  else if(op == 'del'){
    mainState[op](name,key)
  }
})

ipcMain.on('create-browser-view', async (e, panelKey, tabKey, x, y, width, height, zIndex, src, webContents, index, acitve)=>{
  console.log('create-browser-view', panelKey, tabKey, x, y, width, height, zIndex, src, webContents, index, acitve)

  let view
  if(panelKey){
    view = await BrowserView.createNewTab(BrowserWindow.fromWebContents(e.sender), panelKey, tabKey, index, src, acitve)
  }
  else{
    view = await BrowserView.newTab(webContents)
  }
  e.sender.send(`create-browser-view_${panelKey}_${tabKey}`,view.webContents.id)
  // console.log(99944,view)
  // view.webContents.hostWebContents2 = e.sender
  if(zIndex > 0){
    const win = BrowserWindow.fromWebContents(e.sender)
    if(!win || win.isDestroyed()) return


    const winPos = win.getPosition()
    // console.log(443434,x,winPos)
    view.setBounds({ x: Math.round(x) + winPos[0], y:Math.round(y) + winPos[1], width: Math.round(width), height: Math.round(height), zIndex })
  }
  if(src) view.webContents.loadURL(src)
  // ipcMain.emit('web-contents-created', {},view.webContents)
})

const noAttachs = {}
ipcMain.on('no-attach-browser-view', (e, panelKey, tabKeys)=>{
  console.log('no-attach-browser-view', panelKey, tabKeys)
  for(let tabKey of tabKeys){
    noAttachs[`${panelKey}\t${tabKey}`] = true
    setTimeout(()=> delete noAttachs[`${panelKey}\t${tabKey}`],100)
  }
})

let moveingTab
ipcMain.on('move-browser-view', async (e, panelKey, tabKey, type, tabId, x, y, width, height, zIndex, index)=>{
  // height = height - 7 //@TODO
  const win = BrowserWindow.fromWebContents(e.sender)
  if(!win || win.isDestroyed()) return

  console.log('move-browser-view', panelKey, tabKey, type, tabId, x, y, width, height, zIndex, index)

  if(type == 'attach'){
    if(noAttachs[`${panelKey}\t${tabKey}`]){
      console.log('no-attach')
      delete noAttachs[`${panelKey}\t${tabKey}`]

      // if(x != null){
      //   ipcMain.emit('set-bound-browser-view', e, panelKey, tabKey, tabId, x, y, width, height, zIndex)
      // }

      return
    }

    let bounds
    if(width){
      const win = BrowserWindow.fromWebContents(e.sender)
      if(win && !win.isDestroyed()){
        const winBounds = win.getBounds()
        // if(winBounds.x == -7 && winBounds.y == -7){
        //   winBounds.x = 0
        //   winBounds.y = 0
        // }

        bounds = {
          x: Math.round(x) + winBounds.x, y:Math.round(y) + winBounds.y,
          width: Math.round(width), height: Math.round(height), zIndex
        }
      }
    }

    // if(!mainState.openTabNextLabel){
    await BrowserPanel.moveTabs([tabId], panelKey, {index, tabKey}, win, bounds)
    // }
    // moveingTab = false
    console.log([tabId], panelKey, {index, tabKey})
    // if(x != null){
    // ipcMain.emit('set-bound-browser-view', e, panelKey, tabKey, tabId, x, y, width, height, zIndex)
    // }
    if(zIndex > 0){
      webContents.fromId(tabId).focus()
      webContents.fromId(tabId).setActive()
    }
  }
})

ipcMain.on('move-window-from-webview', (e, moveX, moveY) => {
  const tabId = e.sender.id
  const [panelKey, tabKey, browserPanel, browserView] = BrowserPanel.getBrowserPanelByTabId(tabId)
  if(browserPanel.browserWindow.isMaximized()) return

  const [x,y] = browserPanel.browserWindow.getPosition()
  console.log(x, y, moveX, moveY)
  browserPanel.browserWindow.setPosition(x + moveX, y + moveY)
})

const setBoundClearIds = {},dateCache = {}
ipcMain.on('set-bound-browser-view', async (e, panelKey, tabKey, tabId, x, y, width, height, zIndex, date=Date.now())=>{
  if(dateCache[panelKey] && dateCache[panelKey] > date) return

  dateCache[panelKey] = date

  const panel = BrowserPanel.getBrowserPanel(panelKey)
  if(!panel || !webContents.fromId(tabId)){
    await new Promise(r=>setTimeout(r,200))
    ipcMain.emit('set-bound-browser-view', e, panelKey, tabKey, tabId, x, y, width, height, zIndex, date)
    return
  }

  console.log('set-bound-browser-view1', panelKey, tabKey, tabId, x, y, width, height, zIndex, date)


  const win = panel.browserWindow
  if(!win || win.isDestroyed()) return

  const winBounds = win.getBounds()
  // console.log('winBounds',winBounds)
  // if(winBounds.x == -7 && winBounds.y == -7){
  //   winBounds.x = 0
  //   winBounds.y = 0
  // }

  let bounds = {
    x: Math.round(x + winBounds.x), y:Math.round(y + winBounds.y),
    width: Math.round(width), height: Math.round(height), zIndex
  }

  // console.log(11,bounds, winBounds)
  const id = setTimeout(()=>{
    const ids = setBoundClearIds[panelKey]
    delete setBoundClearIds[panelKey]

    // console.log(ids)

    if(!ids) return

    let appearSelf
    for(let [_bounds, _id, _date, _zIndex] of ids || []){
      if(id == _id){
        appearSelf = true
      }
      else{
        clearTimeout(_id)
        if(date < _date || (appearSelf && date == _date)){
          bounds = _bounds
          date = _date
          zIndex = _zIndex
        }
      }
    }
    console.log('set-bound-browser-view2',bounds)
    panel.setBounds(bounds)

    if(zIndex > 0 && isWin){
      // const [panelKey, tabKey, browserPanel, browserView] = BrowserPanel.getBrowserPanelByTabId(tabId)
      // browserPanel.moveTopAll()
    }
  },10)

  if(setBoundClearIds[panelKey]){
    setBoundClearIds[panelKey].push([bounds, id, date, zIndex])
  }
  else{
    setBoundClearIds[panelKey] = [[bounds, id, date, zIndex]]
  }

  // panel.setBounds(bounds)
  // if(zIndex > 0 && isWin){
  //   webContents.fromId(tabId).moveTop()
  // }

})

ipcMain.on('set-position-browser-view', async (e, panelKey) => {
  // console.log('set-position-browser-view1', panelKey)
  const panel = BrowserPanel.getBrowserPanel(panelKey)
  if(!panel) return

  const win = panel.browserWindow
  if(!win || win.isDestroyed()) return

  const pos = await new Promise(r => {
    ipcMain.once(`get-webview-pos-${panelKey}-reply`, (e, pos) => r(pos))
    panel.browserWindow.webContents.send('get-webview-pos', panelKey)
  })

  const winPos = win.getPosition()
  // if(win.isMaximized()){
  //   win.emit('maximize', 'restore')
  // }
  // console.log(Date.now(),'set-position-browser-view', { x:  Math.round(pos.left + winPos[0]), y: Math.round(pos.top + winPos[1]) })
  panel.setBounds({ x:  Math.round(pos.left + winPos[0]), y: Math.round(pos.top + winPos[1])})
})

ipcMain.on('delete-browser-view', (e, panelKey, tabKey)=>{
  // console.trace('delete-browser-view',panelKey,tabKey)

  const win = BrowserWindow.fromWebContents(e.sender)
  if(!win || win.isDestroyed()) return

  const panel = BrowserPanel.getBrowserPanel(panelKey)
  if(!panel) return

  const view = panel.getBrowserView({tabKey})
  if(view && !view.isDestroyed()) view.destroy()

})

// const compMap = {}
// ipcMain.on('operation-overlap-component', (e, opType, panelKey) => {
//   console.log('operation-overlap-component', opType, panelKey)
//   const win = BrowserWindow.fromWebContents(e.sender)
//   if(!win || win.isDestroyed()) return
//
//   for(let type of ['page-status','page-search']){
//     if(type == 'page-status' && opType == 'create' && !compMap[`${type}\t${panelKey}`]){
//       const view = new BrowserView({ webPreferences: {
//           nodeIntegration: false,
//           sandbox: true,
//           preload: type == 'page-search' ? path.join(__dirname, '../page-search-preload.js') : void 0,
//           allowFileAccessFromFileUrls: true,
//           allowUniversalAccessFromFileUrls: true,
//         } })
//       view.setAutoResize({width: false, height: false})
//       const seq = ++global.seqBv
//       win.insertBrowserView(view, seq)
//       win.reorderBrowserView(seq, 0)
//       view.webContents.loadURL(`file://${path.join(__dirname, `../${type}.html`)}`)
//
//       compMap[`${type}\t${panelKey}`] = [seq, view, false]
//     }
//     else if(opType == 'delete' && compMap[`${type}\t${panelKey}`]){
//       win.eraseBrowserView(compMap[`${type}\t${panelKey}`][0])
//       compMap[`${type}\t${panelKey}`][1].destroy()
//       delete compMap[`${type}\t${panelKey}`]
//     }
//   }
// })
//
let wait = false
const extUrlMapping = {}
ipcMain.on('set-overlap-component', async (e, type, panelKey, tabKey, x, y, width, height, url) => {
  if(type != 'extension-popup') return

  console.log('set-overlap-component', x, y, width, height)

  if(Browser.CUSTOM_CHROMIUM){
    if(y != -1){
      if(!url) return

      const panel = BrowserPanel.getBrowserPanel(panelKey)
      const cont = panel.getBrowserView({tabKey}).webContents
      cont.focus()

      const extId = url.split("/")[2]
      extUrlMapping[panelKey + tabKey] = extId

      const page = Browser.cachedBgTargetUrl.get(extId)
      if(page){
        page.evaluate(()=>chrome.browserAction.openPopup(win => window.__popup_window__ = win))
      }
      else if(extId == 'jidkidbbcafjabdphckchenhfomhnfma'){
        cont.hostWebContents2.send('new-tab', cont.id, 'chrome://rewards/')
      }
      e.returnValue = Math.random().toString()
    }
    else{
      const extId = extUrlMapping[panelKey + tabKey]
      if(!extId) return
      delete extUrlMapping[panelKey + tabKey]
      Browser.cachedBgTargetUrl.get(extId).evaluate(()=>{
        window.__popup_window__.window.close()
      })
    }
  }
  else{
    if(y != -1){

      for(let bw of BrowserWindow.getAllWindows()){
        if(!bw.getTitle().includes('Sushi Browser')) continue
        bw.webContents.send('set-overlap-component-open',panelKey, tabKey)
      }

      const win = BrowserWindow.fromWebContents(e.sender)
      if(!win || win.isDestroyed()) return

      const winBounds = win.getBounds()
      // if(winBounds.x == -7 && winBounds.y == -7){
      //   winBounds.x = 0
      //   winBounds.y = 0
      // }
      const bounds = {
        x: Math.round(x + winBounds.x), y:Math.round(y + winBounds.y),
        width: Math.round(width), height: Math.round(height)
      }
      const popupPanel = await Browser.showPopupPanel(panelKey, tabKey, bounds, url)

      e.returnValue = popupPanel && popupPanel.id
    }
    else{
      Browser.hidePopupPanel(panelKey, tabKey)
    }
  }
})

ipcMain.on('change-browser-view-z-index', (e, isFrame, panelKey, force) =>{
  const win = BrowserWindow.fromWebContents(e.sender)
  if(!win || win.isDestroyed()) return

  // console.log('change-browser-view-z-index', isFrame, panelKey, force)
  // console.log('change-browser-view-z-index', isFrame, bvZindexMap[win])
  if(force && !win._alwaysOnTop){
    for(const panel of BrowserPanel.getBrowserPanelsFromBrowserWindow(win)){
      panel.setAlwaysOnTop(!isFrame)
    }
  }
  if(isFrame){
    ipcMain.emit('top-to-browser-window', win.id)
  }
  else if(!isWin && panelKey){
    const panel = BrowserPanel.getBrowserPanel(panelKey)
    if(panel.browserWindow.isFocused()){
      // panel.moveTopAll()
      panel.cpWin.nativeWindow.setForegroundWindowEx()
      console.log('setForegroundWindow10')
    }
  }
  // win.setAlwaysOnTop(!isFrame)
})

// ipcMain.on('change-browser-view-z-index', (e, isFrame) =>{
//   // BrowserWindow.fromWebContents(e.sender).setIgnoreMouseEvents(!isFrame, !isFrame ? {forward: true} : void 0)
// })

ipcMain.on('get-browser-window-from-web-contents', (e, tabId) =>{
  e.returnValue = (BrowserWindow.fromWebContents(webContents.fromId(tabId)) || BrowserWindow.fromWebContents(webContents.fromId(tabId).hostWebContents2)).id
})

ipcMain.on('get-message-sender-info', async (e,tabId) => {
  const contents = webContents.fromId(tabId)
  if(!contents){
    return e.returnValue = null
  }

  const hostWebContents = contents.hostWebContents2
  let window = hostWebContents && BrowserWindow.fromWebContents(hostWebContents)
  if(!window) window = getCurrentWindow()

  e.returnValue = {
    mutedInfo: {muted: await contents.isAudioMuted()},
    status: contents.isLoading ? 'loading' : 'complete',
    title: await contents.getTitle(),
    url: contents.getURL(),
    windowId: window.id
  }
})

ipcMain.on('get-process-info', (e) => {
  e.returnValue = {
    arch: process.arch,
    platform: process.platform
  }
})

// ipcMain.on('webview-mousemove', e => {
//   ipcMain.emit('change-browser-view-z-index',{sender: e.sender.hostWebContents2}, false)
// })

ipcMain.on('send-to-host', (e, ...args)=>{
  // console.log('send-to-host',e,...args)
  // console.log(`send-to-host_${e.sender.id}`,await e.sender.getURL(), args[0])
  const hostCont = e.sender.hostWebContents2 || e.sender.hostWebContents
  if(!hostCont){
    // console.log('send-to-host',e.sender.id,await e.sender.getURL(),...args)
    return
  }
  hostCont.send(`send-to-host_${e.sender.id}`, ...args)
  if(isDarwin && args[0] == 'webview-mousedown'){
    const datas = BrowserPanel.getBrowserPanelByTabId(e.sender.id)
    if(datas[2]){
      const panel = datas[2]
      Browser.bg.evaluate((windowId) => {
        return new Promise(resolve => {
          chrome.windows.update(windowId, {focused: true}, () => resolve())
        })
      }, panel.windowId)
    }
  }
})

ipcMain.on('send-to-webContents', (e, tabId, name,...args)=>{
  const cont = webContents.fromId(tabId)
  cont && cont.send(name, ...args)
})

// ipcMain.on('get-visited-links', (e, key, urls) => {
//   history.find({location: {$in: urls}}).then(hists => {
//     e.sender.send(`get-visited-links-reply_${key}`, hists.map(h => h.location))
//   })
// })

ipcMain.on('page-search-event', (e, panelKey, tabKey, type, ...args) => {
  for(let win of BrowserWindow.getAllWindows()) {
    if(win.getTitle().includes('Sushi Browser')){
      win.webContents.send(`page-search-event-${panelKey}-${tabKey}`, type, ...args)
    }
  }
})

ipcMain.on('did-get-response-details-main', (e, record) =>{
  console.log('did-get-response-details-main', e, record)
  const cont = webContents.fromId(record.tabId)
  if(cont && cont.hostWebContents2) cont.hostWebContents2.send('did-get-response-details',record)
})

ipcMain.on('send-keys', async (event, e, cont) => {
  cont = cont || await getFocusedWebContents()
  if(e.key == 'esc') e.key = 'escape'
  let modify = []
  if(e.altKey) modify.push('alt')
  if(e.shiftKey) modify.push('shift')
  if(e.ctrlKey) modify.push('control')

  if(modify.length){
    cont._sendKey(e.key, modify)
  }
  else{
    cont._sendKey(e.key)
  }
})


ipcMain.on('get-tab-opener',async (e,tabId)=>{
  const tab = await new webContents(tabId)._getTabInfo()
  e.returnValue = tab.openerTabId
})

ipcMain.on('menu-popup',(e)=>{
  const bw = BrowserWindow.fromWebContents(e.sender)
  const panel = BrowserPanel.getBrowserPanelsFromBrowserWindow(bw)[0]
  BrowserPanel.contextMenuShowing = true
  panel.moveTopNativeWindowBw()
  e.sender.send('menu-popup-reply')
  setTimeout(()=>BrowserPanel.contextMenuShowing = false,500)
})

ipcMain.on('menu-popup-end',(e)=>{
  BrowserPanel.contextMenuShowing = false
})

// let incFbw = 0
ipcMain.on('focus-browser-window', async (e, key) => {
  winctl.moveTopTime = Date.now()
  BrowserPanel.contextMenuShowing = true
  // ++incFbw
  console.log(78788)
  const bw = BrowserWindow.fromWebContents(e.sender)

  // if(isLinux && bw.ignoreMouseEvents){
  //   bw.setIgnoreMouseEvents(false)
  //   robot.mouseClick()
  //   bw.setIgnoreMouseEvents(true)
  // }
  // else{
  // const [x,y] = bw.getPosition()
  // robot.moveMouse(x+bounds.x+10, y+bounds.y+10)
  // robot.mouseClick()

  const panel = BrowserPanel.getBrowserPanelsFromBrowserWindow(bw)[0]
  // panel.moveTopAll()
  if(panel.checkShouldMoveTop()){
    panel.cpWin.nativeWindowBw.setForegroundWindowEx()
    console.log('setForegroundWindow11')
  }

  BrowserPanel.contextMenuShowing = false
  e.sender.send(`focus-browser-window-reply_${key}`)
  // bw.focus()
  // }
})

ipcMain.on('set-alwaysOnTop', (e,enable) => {
  mainState.set('alwaysOnTop',enable)
  const bw = BrowserWindow.fromWebContents(e.sender)
  bw.setAlwaysOnTop(enable)
  bw._alwaysOnTop = enable
  for(const panel of BrowserPanel.getBrowserPanelsFromBrowserWindow(bw)){
    panel.moveTopNativeWindow()
    panel.moveTopNativeWindowBw()
    panel.setAlwaysOnTop(enable)
  }
})

ipcMain.on('get-mouse-pos', (e,offsetY,screenY)=>{
  e.returnValue = screen.getCursorScreenPoint().y - screenY + offsetY
})

let mouseGestureBgPage
ipcMain.on('get-enableMouseGesture', (e, type) =>{
  if(type == 'bg') mouseGestureBgPage = e.sender
  mouseGestureBgPage.send('set-enableMouseGesture', mainState.enableMouseGesture)
})

ipcMain.on('cancel-pause-mode', (e, isPaused) => {
  new webContents(e.sender.id).executeJavaScript(isPaused =>{
    const v = document.querySelector('video._mousedowned_')
    const func = isPaused ? v.pause : v.play
    v[isPaused ? 'pause' : 'play'] = () => {}

    v.classList.remove('_mousedowned_')
    document.addEventListener('mouseup', e=> {
      setTimeout(()=>v[isPaused ? 'pause' : 'play'] = func,600)
    }, true)
  }, void 0, void 0, isPaused, true)
})

function getVideoControlledElement(cont){
  return cont.executeJavaScriptInIsolate("("+ (() =>{
    let v = document.querySelector('video._video-controlled-elem__')

    if(!v) return null

    let zoom = 1, maximize = false
    if(v.classList.contains('_maximize-org_')){
      maximize = true
      zoom = parseInt(v.style.width) / 100.0
      if(isNaN(zoom)) zoom = 1
    }

    return {
      duration: v.duration,
      currentTime: v.currentTime,
      paused: v.paused,
      volume: v.volume,
      muted: v.muted,
      boost: window._mediaElements_ && window._mediaElements_.get(v) ? window._mediaElements_.get(v).gain.value : 1,
      playbackRate: v.playbackRate,
      loop: v.loop,
      abRepeat: v._abRepeat_,
      abRepeatRange: v._abRepeatRange_,
      preset: v._preset_ || 'Default',
      equalizer: v._equalizer_ || [0,0,0,0,0,0,0,0,0,0],
      maximize,
      zoom,
      filter: getComputedStyle(v).filter,
      title: document.title,
      location: location.href,
      resolution: `${v.videoWidth}x${v.videoHeight}`
    }

  }).toString() + ")()", void 0, void 0, true)
}

ipcMain.on('get-all-tabs-video-list', async (e, key, tabId) => {
  const result = []

  try{
    console.log('video1',Date.now())
    const promises = []
    for(let bw of BrowserWindow.getAllWindows()){
      if(!bw.getTitle().includes('Sushi Browser')) continue
      promises.push(new Promise(r => {
        const key = Math.random().toString()
        bw.webContents.send('get-all-tab-states',key)
        ipcMain.once(`get-all-tab-states-reply_${key}`, (e,results) => r([bw.id, results]))
      }))
    }
    console.log('video2',Date.now())

    const controlledElements = []
    const tabIds = []
    const webContentsList = webContents.webContentsMap.values()
    for(const cont of webContentsList){
      if(tabId && cont.id != tabId) continue
      const url = await cont.getURL()
      if(url.startsWith('chrome-extension://dckpbojndfoinamcdamhkjhnjnmjkfjd')) continue
      controlledElements.push(await getVideoControlledElement(cont))

      tabIds.push(cont.id)
    }
    console.log('video3',Date.now())

    const tabsList = await Promise.all(promises)
    const conts = {}
    controlledElements.forEach((results, i) => {
      for(const x of (results || [])){
        if(x) conts[tabIds[i]] = x
      }
    })
    console.log('video4',Date.now())

    for(const [winId, win] of tabsList){
      for(const [panelKey, tabs] of win){
        for(const [tabId, active] of tabs){
          const val = conts[tabId]
          if(val){
            val.winId = winId
            val.panelKey = panelKey
            val.tabId = tabId
            val.active = active
            val.showCurrentTime = mainState.showCurrentTime
            result.push(val)
          }
        }
      }
    }
  }catch (e) {
    console.log(e)
  }
  // result.sort((x,y)=> (!x.active && !y.active) || (x.active && y.active) ? 0 : x.active ? -1 : 1)

  const presets = await videoController.findOne({url: '_preset_'})

  e.sender.send(`get-all-tabs-video-list-reply_${key}`, result, presets ? presets.values : void 0)
})


ipcMain.on('get-tab-video', async (e, key, tabId) => {
  const cont = webContents.fromId(tabId)
  let result = null
  if(cont) result = await getVideoControlledElement(cont)

  result = result && result.find(x=>x)
  if(result) result.showCurrentTime = mainState.showCurrentTime

  e.sender.send(`get-tab-video-reply_${key}`, result)
})

ipcMain.on('change-video-value', async (e, tabId, url, name, val) => {
  if(url != '_default_'){
    if(name == 'showCurrentTime'){
      mainState[name] = !mainState[name]
      return
    }

    await Browser.bg.evaluate((tabId, name, val) => {
      if(name == 'active'){
        chrome.tabs.update(tabId, {active: true})
      }
      else{
        chrome.tabs.sendMessage(tabId, {controller: true, name, val})
      }
    },tabId, name, val)


    if(name == 'fullscreen'){
      // setTimeout(()=>{
        const [_1, _2, panel, _3] = BrowserPanel.getBrowserPanelByTabId(tabId)
        panel.moveTopNativeWindow()
      // },200)
    }
  }

  if(name == 'abRepeat' || name == 'equalizer' || name == 'filter'){
    let rec = await videoController.findOne({url})
    if(rec){
      if(val == null){
        delete rec.values[name]
      }
      else{
        rec.values[name] = val
      }
      await videoController.update({_id:rec._id},rec)
    }
    else if(val != null){
      rec = {url, values: {[name]: val}}
      await videoController.insert(rec)
    }
  }
})

ipcMain.on('update-preset', async (e, type, presets) => {
  if(presets == null){
    videoController.remove({url: '_preset_'})
    return
  }

  await videoController.update({url: '_preset_'},{url: '_preset_', values: presets}, {upsert: true})
})

ipcMain.on('get-thumbnails', async (e, tabId, isCapture, isDownload, imageWidth) => {
  const key = Math.random().toString()
  webContents.fromId(tabId).send('get-thumbnails', key, isCapture, isDownload, imageWidth)
  if(isDownload){
    ipcMain.once(`get-thumbnails-reply_${key}`, (e, title, result) => {
      title = sanitizeFilename(title,{replacement:'_'})
      let writePath
      for(const imgUrl of result){
        writePath = path.join(app.getPath('downloads'), `${title}_${Date.now()}.png`)
        fs.writeFileSync(writePath, imgUrl.substring(22), 'base64')
      }
      shell.showItemInFolder(writePath)
    })
  }
})

ipcMain.on('on-video-event', async (e, tabId) => {
  const cont = webContents.fromId(tabId)

  const result = await new Promise(async r => {
    ipcMain.emit('get-sync-main-states', {sender: {send(_, result){ r(result) } }}, ['inputsVideo'], true, await cont.getURL())
  })
  cont.send('on-video-event', result[0])
})