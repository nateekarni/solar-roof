import assert from "node:assert/strict";
import test from "node:test";
import {billingSourcePath} from "./billing-source-model";
test("source path follows actual reception data and values mappings inside each message",()=>{
 assert.equal(billingSourcePath(undefined,"Import_Wh"),'data.values["Import_Wh"]');
 assert.equal(billingSourcePath({messagesPath:"payloads",fieldPaths:{"data.values":"measurements.counters"},deviceAliases:[]},"Import_Wh"),'measurements.counters["Import_Wh"]');
 assert.equal(billingSourcePath({messagesPath:"payloads",fieldPaths:{data:"measurements"},deviceAliases:[]},"Import_Wh"),'measurements.values["Import_Wh"]');
});
