import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './browser-transport.mjs';
import {readDownloadedFile} from './download-reading.mjs';

// Synthetic artifacts served by this process test transport only; application
// authorization/content assertions remain in the real report/history E2Es.
export async function verifyBrowserDownloads(browser) {
  const csv='site,meter\nSchool,meter-1\n',history='12345678901234567890.123456789\n';
  const server=createServer((request,response)=>{
    if(request.url==='/')return response.end('<a href="/report.csv">CSV</a><a href="/history.gz">Gzip</a>');
    const compressed=request.url==='/history.gz';
    response.setHeader('Content-Disposition',`attachment; filename="${compressed?'history.gz':'report.csv'}"`);
    response.end(compressed?gzipSync(history):csv);
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const context=await browser.newContext();
  try {
    const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
    for(const [label,filename] of [['CSV','report.csv'],['Gzip','history.gz']]) {
      const pending=page.waitForEvent('download');await page.getByRole('link',{name:label,exact:true}).click();const download=await pending;
      assert.equal(download.suggestedFilename(),filename);
      const bytes=await readDownloadedFile(download);
      assert.equal(filename.endsWith('.gz')?gunzipSync(bytes).toString():bytes.toString(),filename.endsWith('.gz')?history:csv);
    }
  } finally {await context.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const browser=await openFixtureBrowser(chromium,process.env);
  try {await verifyBrowserDownloads(browser);console.log('PASS browser download transport: CSV and gzip bytes preserved');}
  finally {await browser.close();}
}
