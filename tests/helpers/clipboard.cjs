'use strict';
// These functions run inside Electron via Playwright evaluate: keep them closure-free.
async function snapshotClipboard({clipboard,ClipboardItem}){
 const saved=[];
 for(const item of await clipboard.read()){
  // Windows can return a native empty placeholder, not just an empty item array.
  if(!item.types.length)continue;
  const values=await Promise.all(item.types.map(async type=>[type,await item.getType(type)]));
  saved.push(new ClipboardItem(Object.fromEntries(values)));
 }
 // Publish only a complete backup, before a test performs any clipboard writes.
 globalThis.__naraeQaClipboard=saved;
}
async function restoreClipboard({clipboard}){
 if(!Object.hasOwn(globalThis,'__naraeQaClipboard'))return;
 const saved=globalThis.__naraeQaClipboard;
 if(saved.length)await clipboard.write(saved);
 else await clipboard.clear();
 delete globalThis.__naraeQaClipboard;
}
module.exports={snapshotClipboard,restoreClipboard};
