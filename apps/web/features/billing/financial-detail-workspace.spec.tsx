import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PaymentHistory} from './payment-history';
import {PaymentVerificationDialog} from './payment-verification-dialog';
import {financialDocuments,initialFinancialDocument,FinancialDocumentList} from './financial-document-list';
import {OriginalDocumentDownload} from '../shared/inline-original-document';
import {OriginalPdfContent} from '../shared/original-document-preview';

test('missing optional payer metadata is omitted from transfer details',()=>{
 const html=renderToStaticMarkup(<PaymentHistory locale="en" payments={[{id:'legacy',amount:null,status:'paid'}]}/>);
 assert.doesNotMatch(html,/Payer name|Origin bank|Origin account|Payment method/);
});

test('rejection reason is requested only after choosing reject',()=>{
 const html=renderToStaticMarkup(<PaymentVerificationDialog inline open onOpenChange={()=>{}} billingCycle={{id:'bill'}}/>);
 assert.doesNotMatch(html,/id="rejection-reason"/);
});

test('invoice, receipt and every slip remain individually selectable, pending evidence opens first',()=>{
 const bill={id:'bill',invoiceId:'invoice-doc',receiptId:'receipt-doc',payments:[{id:'old',amount:null,status:'rejected'},{id:'pending',amount:null,status:'pending_verification'}]};
 const documents=financialDocuments('billing',bill,bill);
 assert.deepEqual(documents.map(document=>document.id),['invoice','receipt','payment:old','payment:pending']);
 assert.equal(initialFinancialDocument(documents),'payment:pending');
 assert.equal(documents[0]?.source?.documentId,'invoice-doc');
 assert.equal(documents[1]?.source?.documentId,'receipt-doc');
 const html=renderToStaticMarkup(<FinancialDocumentList documents={documents} selected={null} onSelect={()=>{}} disabled={false} locale="en"/>);
 assert.equal((html.match(/aria-expanded="false"/g)||[]).length,8);
 assert.match(html,/Select a document to preview/);
 assert.doesNotMatch(html,/<iframe|<img/);
});

test('review controls exist only on pending evidence and retain its exact target',()=>{
 const documents=financialDocuments('billing',{id:'bill',payments:[{id:'old',amount:null,status:'paid'},{id:'pending-exact',amount:null,status:'pending_verification'}]},null);
 const reviewed:Array<[string,string]>=[];
 const element=FinancialDocumentList({documents,selected:null,onSelect:()=>{},disabled:false,locale:'en',canReview:true,onReview:(id,action)=>reviewed.push([id,action])});
 const visit=(node:React.ReactNode)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!React.isValidElement<{children?:React.ReactNode;onClick?:()=>void}>(node))return;if(node.props.children==='Approve'||node.props.children==='Reject')node.props.onClick?.();visit(node.props.children);};
 visit(element);
 assert.deepEqual(reviewed,[['pending-exact','approved'],['pending-exact','rejected']]);
 const html=renderToStaticMarkup(<FinancialDocumentList documents={documents} selected={null} onSelect={()=>{}} disabled={false} locale="en" canReview={false} onReview={()=>{}}/>);
 assert.doesNotMatch(html,/>Approve<|>Reject</);
});

test('receipt remains previewable before related billing has loaded',()=>{
 const documents=financialDocuments('receipts',{id:'receipt-id'},null);
 assert.equal(documents.length,1);
 assert.equal(documents[0]?.source?.documentId,'receipt-id');
 const loaded=financialDocuments('receipts',{id:'receipt-id'},{id:'bill',invoiceId:'invoice-id',payments:[]});
 assert.equal(initialFinancialDocument(loaded,'receipts'),'receipt');
});

test('expanded evidence preview stays inside the selected list item',()=>{
 const documents=financialDocuments('billing',{id:'bill',payments:[{id:'first',amount:null,status:'paid',slipUrl:'https://example.test/first.png'},{id:'second',amount:null,status:'pending_verification',slipUrl:'https://example.test/second.png'}]},null);
 const html=renderToStaticMarkup(<FinancialDocumentList documents={documents} selected="payment:second" onSelect={()=>{}} disabled={false} locale="en"/>);
 const items=html.match(/<li\b[\s\S]*?<\/li>/g)??[];
 assert.equal(items.length,3);
 assert.match(items[2]!,/<img[^>]+second\.png/);
 assert.doesNotMatch(items[1]!,/<img/);
 assert.match(items[2]!,/aria-controls="financial-document-payment:second"/);
});

test('split review has only one document selector owned by the workspace',()=>{
 const html=renderToStaticMarkup(<PaymentVerificationDialog inline formOnly selectedPaymentId="pending" open onOpenChange={()=>{}} billingCycle={{id:'bill'}}/>);
 assert.match(html,/verified-amount/);
 assert.doesNotMatch(html,/review-transfer|<iframe/);
});

test('inline PDF preview and download retain the same verified blob and downloading stops propagation',()=>{
 const url='blob:https://solar.test/verified-original';
 const element=OriginalDocumentDownload({url,number:'INV-2026-01',th:false});
 const link=element.props.children;
 assert.equal(link.props.href,url);
 let stopped=false;
 link.props.onClick({stopPropagation:()=>{stopped=true;}});
 assert.equal(stopped,true);
 const html=renderToStaticMarkup(<OriginalPdfContent url={url} error={false} number="INV-2026-01" th={false} inline/>);
 assert.match(html,/aria-label="Original document"/);
 assert.doesNotMatch(html,/<iframe/);
 assert.doesNotMatch(html,/<a/);
});
