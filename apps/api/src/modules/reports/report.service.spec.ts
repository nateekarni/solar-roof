import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {ReportService} from "./report.service.js";
test("CSV neutralizes spreadsheet formula cells without corrupting numeric values",()=>{
 const csv=new ReportService().createCsv("energy",[{site:"=1+1",energy:12.5,note:'a,"b'}]);
 assert.ok(csv.includes('"\'=1+1"'));
 assert.ok(csv.includes('"12.5"'));
 assert.ok(csv.includes('"a,""b"'));
});
