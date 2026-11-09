'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {snapshotClipboard,restoreClipboard}=require('./helpers/clipboard.cjs');
class Item{
 constructor(values){this.types=Object.keys(values);if(!this.types.length)throw TypeError('at least one MIME type is required');this.values=values;}
 async getType(type){return this.values[type];}
}
function fixture(items){const writes=[];return {api:{ClipboardItem:Item,clipboard:{read:async()=>items,write:async items=>{assert(items.length,'native write([]) does not clear the Windows clipboard');writes.push(items);},clear:async()=>{writes.push([]);}}},writes};}
function cleanup(t){delete globalThis.__naraeQaClipboard;t.after(()=>{delete globalThis.__naraeQaClipboard;});}
test('Windows clipboard placeholder with no MIME types is backed up and restored as empty',async t=>{
 cleanup(t);const {api,writes}=fixture([{types:[],getType:async()=>{throw Error('must not read an empty item');}}]);
 await snapshotClipboard(api);assert.deepEqual(globalThis.__naraeQaClipboard,[]);
 await restoreClipboard(api);assert.deepEqual(writes,[[]]);assert.equal(Object.hasOwn(globalThis,'__naraeQaClipboard'),false);
});
test('empty clipboard array is restored instead of leaving QA text or image behind',async t=>{
 cleanup(t);const {api,writes}=fixture([]);await snapshotClipboard(api);await restoreClipboard(api);assert.deepEqual(writes,[[]]);
});
test('readable text, HTML and image bytes survive snapshot and restore beside empty placeholders',async t=>{
 cleanup(t);const text=new Blob(['원래 한글'],{type:'text/plain'}),html=new Blob(['<b>원래 한글</b>'],{type:'text/html'}),image=new Blob([Buffer.from([0,1,2,255])],{type:'image/png'});
 const {api,writes}=fixture([{types:[]},new Item({'text/plain':text,'text/html':html}),new Item({'image/png':image})]);
 await snapshotClipboard(api);await restoreClipboard(api);assert.equal(writes[0].length,2);
 assert.deepEqual(writes[0][0].types,['text/plain','text/html']);assert.equal(await(await writes[0][0].getType('text/plain')).text(),'원래 한글');
 assert.deepEqual(Buffer.from(await(await writes[0][1].getType('image/png')).arrayBuffer()),Buffer.from([0,1,2,255]));
});
test('failed snapshot never records a partial backup or clears the clipboard during cleanup',async t=>{
 cleanup(t);const {api,writes}=fixture([new Item({'text/plain':new Blob(['keep'])}),{types:['image/png'],getType:async()=>{throw Error('clipboard changed');}}]);
 await assert.rejects(snapshotClipboard(api),/clipboard changed/);assert.equal(Object.hasOwn(globalThis,'__naraeQaClipboard'),false);
 await restoreClipboard(api);assert.deepEqual(writes,[]);
});
test('failed restore retains the backup for retry and does not silently claim restoration',async t=>{
 cleanup(t);const {api}=fixture([]);await snapshotClipboard(api);api.clipboard.clear=async()=>{throw Error('clipboard locked');};
 await assert.rejects(restoreClipboard(api),/clipboard locked/);assert.deepEqual(globalThis.__naraeQaClipboard,[]);
});
