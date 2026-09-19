const fallback = media => ({ title: media.originalName?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || 'Untitled media', description: 'Review and add a description before publishing.', category: 'Other', tags: [], altText: 'KripaBot media awaiting review', confidence: 0, suggestedSection: 'Gallery' })
const categories = new Set(['Robot','Competition','WRO','Team','School','Events','Project','Other'])
export function validateAnalysis(value, media) {
  const base=fallback(media); if(!value || typeof value!=='object') throw new Error('Malformed AI response.')
  const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):''
  const category=categories.has(value.category)?value.category:'Other'
  const tags=Array.isArray(value.tags)?value.tags.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,40)).filter(Boolean).slice(0,10):[]
  const confidence=typeof value.confidence==='number'&&Number.isFinite(value.confidence)?Math.max(0,Math.min(1,value.confidence)):0
  return {...base,title:text(value.title,120)||base.title,description:text(value.description,600)||base.description,category,tags,altText:text(value.altText || value.suggestedAltText,250)||base.altText,confidence,suggestedSection:text(value.suggestedSection,60)||base.suggestedSection}
}
function aiError(media, error) { return {...fallback(media), error:error.message || 'AI analysis unavailable'} }
async function gemini(media, file) {
  const key=process.env.GEMINI_API_KEY || process.env.AI_API_KEY; if(!key) throw new Error('Gemini is not configured: provide GEMINI_API_KEY on the server.')
  if(!file?.buffer || !file.mimeType.startsWith('image/')) return fallback(media)
  const prompt='Analyze this KripaBot student robotics image. Return JSON only with title, description, category (Robot|Competition|WRO|Team|School|Events|Project|Other), tags (array), altText, confidence (0 to 1), suggestedSection. Do not invent awards, rankings, names, dates, locations, technical specifications, or claims. Use cautious wording when uncertain.'
  const model=process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  let response; try { response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:file.mimeType,data:file.buffer.toString('base64')}}]}],generationConfig:{responseMimeType:'application/json',temperature:0.2,maxOutputTokens:600}}),signal:AbortSignal.timeout(25_000)}) } catch { throw new Error('Gemini timed out or is unavailable.') }
  if(response.status===429) throw new Error('Gemini rate limit reached; upload was saved without AI suggestions.')
  if(!response.ok) throw new Error(`Gemini analysis failed (${response.status}); upload was saved without AI suggestions.`)
  const payload=await response.json(); const raw=payload?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(''); if(!raw) throw new Error('Gemini returned no usable analysis.')
  try { return validateAnalysis(JSON.parse(raw.replace(/^```json\s*|\s*```$/g,'')),media) } catch { throw new Error('Gemini returned malformed metadata.') }
}
/** Provider-neutral boundary. Failures return safe editable suggestions and never block uploads. */
export async function analyzeMedia(media, file) { const provider=(process.env.AI_PROVIDER||'none').toLowerCase(); if(provider==='none') return fallback(media); try { if(provider==='gemini') return await gemini(media,file); return aiError(media,new Error(`Unknown AI provider: ${provider}.`)) } catch(error) { return aiError(media,error) } }
