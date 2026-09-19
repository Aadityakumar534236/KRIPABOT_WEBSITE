/** KripaBot Drive bridge. Set properties in Apps Script > Project Settings. */
var PROPS = PropertiesService.getScriptProperties();
var MEDIA_HEADERS = ['id','storageKey','filename','mimeType','driveFileId','title','description','category','tags','altText','status','createdAt','updatedAt'];
var IMAGE_MIMES = ['image/jpeg','image/png','image/webp','image/gif'];
var VIDEO_MIMES = ['video/mp4','video/webm','video/quicktime'];
// Conservative project caps, not claims about a platform-wide Apps Script maximum.
var DEFAULT_MAX_BRIDGE_BYTES = 4 * 1024 * 1024;
var DEFAULT_MAX_VIDEO_BYTES = 2 * 1024 * 1024;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json_({ok:false,error:'Malformed request.'});
    var request = JSON.parse(e.postData.contents);
    if (!sameSecret_(request.secret, PROPS.getProperty('KRIPABOT_SECRET'))) return json_({ok:false,error:'Unauthorized request.'});
    var action = request.action || request.operation; // compatibility with the existing Node provider
    if (['upload','delete','get','list'].indexOf(action) === -1) return json_({ok:false,error:'Unsupported action.'});
    if (action === 'upload') return json_(upload_(request));
    if (action === 'delete') return json_(delete_(request));
    if (action === 'get') return json_(get_(request));
    return json_(list_());
  } catch (err) {
    console.error(err);
    return json_({ok:false,error:'Google Drive bridge could not complete the request.'});
  }
}

function upload_(request) {
  if (!validName_(request.filename) || !validMime_(request.mimeType) || typeof request.data !== 'string') return {ok:false,error:'Invalid upload data.'};
  var size = base64Size_(request.data), limit = bridgeLimit_(request.mimeType);
  if (size < 0) return {ok:false,error:'Invalid file encoding.'};
  if (size > limit) return {ok:false,error:sizeError_(request.mimeType, limit)};
  try {
    var folder = mediaFolder_();
    var blob = Utilities.newBlob(Utilities.base64Decode(request.data), request.mimeType, request.filename);
    var file = folder.createFile(blob), now = new Date().toISOString(), key = file.getId();
    var warning = indexSafely_({id:key,storageKey:key,filename:file.getName(),mimeType:file.getMimeType(),driveFileId:key,title:'',description:'',category:'Other',tags:'',altText:'',status:'uploaded',createdAt:now,updatedAt:now});
    return {ok:true,storageKey:key,fileId:key,filename:file.getName(),mimeType:file.getMimeType(),sizeBytes:file.getSize(),indexWarning:warning || undefined};
  } catch (err) { console.error(err); return {ok:false,error:'Drive upload failed. Check the configured Drive folder.'}; }
}

function delete_(request) {
  if (!validKey_(request.storageKey)) return {ok:false,error:'Invalid storage key.'};
  try { DriveApp.getFileById(request.storageKey).setTrashed(true); var warning=markDeletedSafely_(request.storageKey); return {ok:true,storageKey:request.storageKey,indexWarning:warning || undefined}; }
  catch (err) { console.error(err); return {ok:false,error:'Drive file could not be deleted.'}; }
}

function get_(request) {
  if (!validKey_(request.storageKey)) return {ok:false,error:'Invalid storage key.'};
  try {
    var file=DriveApp.getFileById(request.storageKey), mime=file.getMimeType(), size=file.getSize(), limit=bridgeLimit_(mime);
    if (size > limit) return {ok:false,error:sizeError_(mime,limit)};
    var blob=file.getBlob();
    return {ok:true,storageKey:request.storageKey,mimeType:blob.getContentType(),sizeBytes:size,base64:Utilities.base64Encode(blob.getBytes())};
  } catch (err) { console.error(err); return {ok:false,error:'Drive file is unavailable.'}; }
}

function list_() {
  try { var files=mediaFolder_().getFiles(), items=[]; while(files.hasNext()){var f=files.next();items.push({storageKey:f.getId(),filename:f.getName(),mimeType:f.getMimeType(),sizeBytes:f.getSize(),createdAt:f.getDateCreated().toISOString()});} return {ok:true,items:items}; }
  catch (err) { console.error(err); return {ok:false,error:'Drive folder is unavailable. Check the configured folder ID.'}; }
}

function mediaFolder_() { var id=PROPS.getProperty('KRIPABOT_MEDIA_FOLDER_ID') || PROPS.getProperty('KRIPABOT_DRIVE_FOLDER_ID'); if(!id)throw new Error('missing folder'); return DriveApp.getFolderById(id); }
function bridgeLimit_(mime) { var configured=Number(PROPS.getProperty('KRIPABOT_MAX_BRIDGE_BYTES')) || DEFAULT_MAX_BRIDGE_BYTES; if(VIDEO_MIMES.indexOf(mime)!==-1)return Math.min(configured,Number(PROPS.getProperty('KRIPABOT_MAX_VIDEO_BYTES')) || DEFAULT_MAX_VIDEO_BYTES); return configured; }
function sizeError_(mime,limit) { return VIDEO_MIMES.indexOf(mime)!==-1 ? 'Video exceeds the Apps Script bridge limit of '+Math.floor(limit/1024/1024)+' MB. Use local storage or a dedicated video storage solution.' : 'File exceeds the Apps Script bridge limit of '+Math.floor(limit/1024/1024)+' MB.'; }
function base64Size_(value) { if(!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length%4!==0)return -1; return Math.floor(value.length*3/4)-(value.slice(-2)==='=='?2:value.slice(-1)==='='?1:0); }
function mediaSheet_() { var id=PROPS.getProperty('KRIPABOT_SHEET_ID'); if(!id)return null; var book=SpreadsheetApp.openById(id), sheet=book.getSheetByName('Media'); if(!sheet)sheet=book.insertSheet('Media'); if(sheet.getLastRow()===0)sheet.appendRow(MEDIA_HEADERS); return sheet; }
function indexSafely_(record) { try { var sheet=mediaSheet_(); if(sheet)sheet.appendRow(MEDIA_HEADERS.map(function(h){return record[h] || '';})); return ''; } catch(err){console.error(err);return 'Media was stored, but optional Sheet indexing failed.';} }
function markDeletedSafely_(key) { try { var sheet=mediaSheet_();if(!sheet||sheet.getLastRow()<2)return '';var values=sheet.getRange(2,2,sheet.getLastRow()-1,1).getValues();for(var i=0;i<values.length;i++)if(values[i][0]===key){sheet.getRange(i+2,11).setValue('deleted');sheet.getRange(i+2,13).setValue(new Date().toISOString());return '';}return ''; } catch(err){console.error(err);return 'Drive file was deleted, but optional Sheet indexing failed.';} }
function validKey_(key) { return typeof key==='string' && /^[A-Za-z0-9_-]{10,200}$/.test(key); }
function validName_(name) { return typeof name==='string' && name.length>0 && name.length<=180 && !/[\\/\0]/.test(name); }
function validMime_(mime) { return IMAGE_MIMES.indexOf(mime)!==-1 || VIDEO_MIMES.indexOf(mime)!==-1; }
function sameSecret_(provided,expected) { if(typeof provided!=='string'||typeof expected!=='string'||!expected)return false;var a=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,provided),b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,expected);if(a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
