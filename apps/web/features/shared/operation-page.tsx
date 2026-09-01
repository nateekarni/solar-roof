import { Download, Plus, Search } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

export function OperationPage({ eyebrow, title, description, columns, rows, action }: { eyebrow: string; title: string; description: string; columns: string[]; rows: string[][]; action?: string }) {
  return <section><div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <Button type="button"><Plus />{action}</Button>}</div><div className="toolbar"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" aria-label="ค้นหา" placeholder="ค้นหา..." /></div><select aria-label="ตัวกรอง"><option>ทั้งหมด</option><option>ใช้งานอยู่</option><option>ต้องตรวจสอบ</option></select><Button type="button" variant="secondary"><Download />ส่งออก CSV</Button></div><Card className="panel table-wrap"><Table><TableHeader><TableRow>{columns.map(column => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <TableCell key={`${cell}-${cellIndex}`}>{cellIndex === row.length - 1 ? <Badge variant="secondary" className="table-status">{cell}</Badge> : cell}</TableCell>)}</TableRow>)}</TableBody></Table></Card></section>;
}
