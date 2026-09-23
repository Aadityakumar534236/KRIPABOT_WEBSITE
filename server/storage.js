import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.env.DATA_DIR || 'server/data')
const file = path.join(dataDir, 'db.json')
const initial = { media: [], achievements: [], projects: [{ id:'project-1', name:'KripaBot', description:'Smart robotics and innovation for better temple service.', status:'Active' }], team:[{id:'aaditya',name:'Aaditya',role:'Programmer'},{id:'ashish',name:'Ashish',role:'Designer'},{id:'ansh',name:'Ansh',role:'Designer'}], links:{ instagram:'https://www.instagram.com/kripabot.india?stkn=MWt5ZWV4YXlod2F3OA==', youtube:'https://youtube.com/@kripabot_india?si=hQhsivuRgLsK54-M', wro:'https://wroindia.org/', email:'kripabot.india@gmail.com' }, settings:{ heroText:'भक्तीने सेवा, स्मार्ट प्रसादाचा मेवा.' }, categories:['Robot','Competition','WRO','Team','School','Events','Project','Other'] }

export function db() {
  fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial, null, 2))
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function save(value) {
  fs.mkdirSync(dataDir, { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temp, JSON.stringify(value, null, 2))
  fs.renameSync(temp, file)
}
