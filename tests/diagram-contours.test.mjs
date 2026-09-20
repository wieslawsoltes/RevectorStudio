import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument} from '@revector/model';import {detectDiagram} from '@revector/rules-document';
const circle=(id,x)=>({id,type:'CIRCLE',center:[x,10],radius:10,layer:'0'});
const text=(id,x,y,width=2)=>({id,type:'TEXT',text:id,position:[x,y],height:1,width,layer:'0'});
const line=(a,b)=>({id:'link',type:'LINE',start:a,end:b,layer:'0'});
const detect=entities=>detectDiagram(createDocument({entities}));
test('Circle corner-box labels are excluded from diagram nodes',()=>{assert.equal(detect([circle('c',10),text('outside',18,18)]).length,0);assert.equal(detect([circle('c',10),text('inside',9,9)]).length,1);});
test('Connectors ending inside shape boxes but away from contours are not connected',()=>{
 const es=[circle('a',10),circle('b',50),text('A',9,9),text('B',49,9)];
 assert.equal(detect([...es,line([10,10],[50,10])]).filter(p=>p.evidence[0].kind==='diagram-connection').length,0);
 assert.equal(detect([...es,line([20,10],[40,10])]).filter(p=>p.evidence[0].kind==='diagram-connection').length,1);
});
test('Nested regions assign labels to the smallest unambiguous contour',()=>{
 const a=circle('large',10),b={...circle('small',10),radius:5};const p=detect([a,b,text('A',9,9)]);
 assert.equal(p.length,1);assert.ok(p[0].members.includes('small'));assert.ok(!p[0].members.includes('large'));
});
test('Concave contour notches crossing a text box do not count as containment',()=>{
 const shape={id:'notched',type:'LWPOLYLINE',closed:true,points:[[0,0],[20,0],[20,20],[11,20],[11,8],[9,8],[9,20],[0,20]],layer:'0'};
 assert.equal(detect([shape,text('wide',6,9,9)]).length,0);assert.equal(detect([shape,text('left',1,9,3)]).length,1);
});
test('Self-intersecting polygons, partial ellipses and bulged polylines are not guessed',()=>{
 const shapes=[{id:'bow',type:'LWPOLYLINE',closed:true,points:[[0,0],[20,20],[0,20],[20,0]]},
 {id:'arc',type:'ELLIPSE',center:[10,10],major:[10,0],ratio:.5,startParam:0,endParam:Math.PI},
 {id:'bulge',type:'LWPOLYLINE',closed:true,points:[[0,0],[20,0],[20,20],[0,20]],bulges:[1,0,0,0]}];
 for(const shape of shapes)assert.equal(detect([{...shape,layer:'0'},text('x',9,9)]).length,0,shape.id);
});
test('Ambiguous coincident contours do not claim label ownership',()=>{assert.equal(detect([circle('a',10),circle('b',10),text('label',9,9)]).length,0);});
