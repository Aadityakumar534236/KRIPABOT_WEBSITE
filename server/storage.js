import fs from 'node:fs'
import path from 'node:path'
const dataDir = path.resolve('server/data'); const file = path.join(dataDir, 'db.json')
const initial = { media: [], achievements: [], projects: [{ id:'project-1', name:'KripaBot', description:'Smart robotics and innovation for better temple service.', status:'Active' }], team:[{id:'aaditya',name:'Aaditya',role:'Programmer'},{id:'ashish',name:'Ashish',role:'Designer'},{id:'ansh',name:'Ansh',role:'Designer'}], links:{ instagram:'https://www.instagram.com/kripabot.india?stkn=MWt5ZWV4YXlod2F3OA==', youtube:'https://youtube.com/@kripabot_india?si=hQhsivuRgLsK54-M', wro:'https://wroindia.org/', email:'kripabot.india@gmail.com' }, settings:{ heroText:'Smart robotics and innovation for better temple service.' }, categories:['Robot','Competition','WRO','Team','School','Events','Project','Other'] }
export function db() { fs.mkdirSync(dataDir,{recursive:true}); if(!fs.existsSync(file)) fs.writeFileSync(file,JSON.stringify(initial,null,2)); return JSON.parse(fs.readFileSync(file,'utf8')) }
export function save(value) { fs.writeFileSync(file,JSON.stringify(value,null,2)) }
