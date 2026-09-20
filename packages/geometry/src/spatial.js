/** Deterministic static median BVH. In-place selection avoids recursive full-array
 * sorts/copies; leaf order matches the original median-sort implementation. */
const intersects = (a,b) => a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const compare = axis => (a,b) => (a.box[axis]+a.box[axis+2])-(b.box[axis]+b.box[axis+2])||a.index-b.index;
function sortRange(items,lo,hi,cmp) {
    const sorted=items.slice(lo,hi).sort(cmp);
    for(let i=0;i<sorted.length;i++)items[lo+i]=sorted[i];
}
function select(items,lo,hi,k,cmp) {
    let budget=2*Math.ceil(Math.log2(hi-lo+1));
    while(hi-lo>16) {
        if(!budget--){sortRange(items,lo,hi,cmp);return;}
        const pivot=items[(lo+hi)>>>1];let i=lo,j=hi-1;
        while(i<=j){while(cmp(items[i],pivot)<0)i++;while(cmp(items[j],pivot)>0)j--;
            if(i<=j){const t=items[i];items[i++]=items[j];items[j--]=t;}}
        if(k<=j)hi=j+1;else if(k>=i)lo=i;else return;
    }
    sortRange(items,lo,hi,cmp);
}
export class BoxIndex {
    constructor(items=[],getBox=x=>x.bounds) {
        this.items=items;this.getBox=getBox;
        const entries=items.map((item,index)=>({item,index,box:getBox(item)}));
        this.root=this.#build(entries,0,entries.length,-1);
    }
    #build(entries,lo,hi,parentAxis) {
        if(lo===hi)return null;
        const box=[Infinity,Infinity,-Infinity,-Infinity];
        for(let i=lo;i<hi;i++){const b=entries[i].box;box[0]=Math.min(box[0],b[0]);box[1]=Math.min(box[1],b[1]);box[2]=Math.max(box[2],b[2]);box[3]=Math.max(box[3],b[3]);}
        if(hi-lo<=12){if(parentAxis>=0)sortRange(entries,lo,hi,compare(parentAxis));return {box,items:entries.slice(lo,hi)};}
        const axis=box[2]-box[0]>=box[3]-box[1]?0:1,mid=(lo+hi)>>>1;
        select(entries,lo,hi,mid,compare(axis));
        return {box,left:this.#build(entries,lo,mid,axis),right:this.#build(entries,mid,hi,axis)};
    }
    /** Callback traversal avoids allocating an array for internal geometric predicates. */
    visit(box,callback) {
        const stack=[this.root];
        while(stack.length){const node=stack.pop();if(!node||!intersects(node.box,box))continue;
            if(node.items){for(const entry of node.items)if(intersects(entry.box,box))callback(entry.item);}
            else stack.push(node.left,node.right);
        }
    }
    search(box){const result=[];this.visit(box,item=>result.push(item));return result;}
}
