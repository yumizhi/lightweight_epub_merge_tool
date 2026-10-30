import { expect, it } from "vitest";
import { mergeEpubFiles, mergeEpubs, splitEpubFile, splitEpub, inspectEpub, readSourceBook, type ProcessingProgress } from "../ts/src/index.js";
import { archiveFiles, readZip, writeZip } from "../ts/src/zip.js";
import { input } from "./fixtures.js";
import { MERGE_MANIFEST_PATH } from "../ts/src/epub-io.js";

it("loads Blob inputs sequentially and shares the synchronous merge rules", async () => {
  const reads: string[] = [], progress: ProcessingProgress[] = [];
  const files = [input(2), input(1)].map(book => {
    const file = new Blob([book.data as Uint8Array<ArrayBuffer>]);
    const read = file.arrayBuffer.bind(file);
    file.arrayBuffer = async () => { reads.push(book.name); return read(); };
    return { name: book.name, file };
  });
  const result = await mergeEpubFiles("collection.epub", files, { inputOrder: true }, {
    onProgress: (event) => { progress.push(event); if (event.file === "volume-2.epub" && event.phase === "resources") expect(reads).toEqual(["volume-2.epub"]); },
  });
  expect(reads).toEqual(["volume-2.epub", "volume-1.epub"]);
  expect(progress.filter(p=>p.phase==='resources' && p.completed===p.total)).toHaveLength(2);
  const data = new Uint8Array(await result.blob.arrayBuffer());
  expect(inspectEpub(data).sources).toEqual(["volume-2.epub", "volume-1.epub"]);
  const restored = await splitEpubFile(result.blob);
  expect(restored.map(book=>book.name)).toEqual(["volume-2.epub", "volume-1.epub"]);
  for(const [index,book] of restored.entries()) {
    const recovered = readSourceBook({name:book.name,data:new Uint8Array(await book.blob.arrayBuffer())});
    expect(recovered.itemData.get("Images/pixel.png")).toEqual(readSourceBook(input(2-index)).itemData.get("Images/pixel.png"));
  }
  const archive = await archiveFiles(restored.map(book=>({name:book.name,file:book.blob})));
  expect([...readZip(new Uint8Array(await archive.arrayBuffer())).keys()]).toEqual(restored.map(book=>book.name));
});
it("orders asynchronous inputs and supports aborting before the next input is read", async () => {
  const files = [input(2),input(1)].map(book=>({name:book.name,file:new Blob([book.data as Uint8Array<ArrayBuffer>])}));
  const merged = await mergeEpubFiles("sorted.epub",files);
  expect(inspectEpub(new Uint8Array(await merged.blob.arrayBuffer())).sources).toEqual(["volume-1.epub","volume-2.epub"]);
  const controller=new AbortController();
  await expect(mergeEpubFiles("cancel.epub",files,{inputOrder:true},{signal:controller.signal,onProgress:()=>controller.abort()})).rejects.toMatchObject({name:"AbortError"});
});
it("reads pre-1.1 v1 records that have no package metadata",()=>{
  const zip=readZip(mergeEpubs("old.epub",[input(1),input(2)]).data);
  const record=JSON.parse(new TextDecoder().decode(zip.get(MERGE_MANIFEST_PATH)));
  for(const source of record.sources) {delete source.package_metadata;source.sha256="legacy-informational-digest";}
  zip.set(MERGE_MANIFEST_PATH,new TextEncoder().encode(JSON.stringify(record)));
  const old=writeZip([...zip].map(([name,data])=>({name,data,level:name==='mimetype'?0:6})));
  expect(splitEpub(old).map(book=>readSourceBook(book).title)).toEqual(["Volume 1","Volume 2"]);
});
