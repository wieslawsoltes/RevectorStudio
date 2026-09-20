import {fitCircularPolyline,fitCubicPolyline} from '@revector/geometry';
import {checkAbort} from '@revector/model';
export const curveRecoveryRule={id:'cad.sampled-curves',version:'1.0.0',title:'Sampled curve reconstruction',stage:25,
    description:'Reviewable ARC/CIRCLE and continuously bounded piecewise cubic hypotheses for sampled raster linework.',
    run:({document,options,signal})=>{
        if(options.profile==='exact')return [];
        const out=[];let total=0;
        for(const e of document.entities){
            checkAbort(signal);
            if(e.type!=='LWPOLYLINE'||e.bulges?.some(Boolean)||e.points.length<6||(!e.source?.rasterInference&&!options.fitNativePolylines))continue;
            if((total+=e.points.length)>200000)throw new RangeError('Curve recovery sample budget exceeded');
            const span=Math.hypot(document.pageBox[2]-document.pageBox[0],document.pageBox[3]-document.pageBox[1]);
            const tolerance=options.curveTolerance??Math.max(1e-6,span*1e-4),config={tolerance,closed:!!e.closed,signal};
            const circle=fitCircularPolyline(e.points,config),fit=circle?null:fitCubicPolyline(e.points,config);
            if(fit&&fit.curves.length*3>=e.points.length)continue; // Do not replace simple polylines with larger spline data.
            const {points,closed,bulges,constantWidth,bounds,type,...base}=e;
            if(constantWidth)continue;
            const evidence=circle?.evidence||fit.evidence;
            const add=circle?[{...base,...circle,id:e.id+'-curve'}]:fit.curves.map((c,i)=>({...base,id:e.id+'-fit-'+i,type:'SPLINE',degree:3,controlPoints:c.controlPoints,knots:[0,0,0,0,1,1,1,1],weights:[],closed:false}));
            for(const a of add){delete a.evidence;a.source={...base.source,curveFit:evidence};a.semantic={...base.semantic,class:'reconstructed-curve',method:'sampled-curve-inference'};}
            out.push({title:`Fit ${e.points.length} sampled vertices as ${circle?.type||add.length+' cubic splines'}`,members:[e.id],confidence:.9,exact:false,errorBound:evidence.errorBound,evidence:[evidence,{kind:'inference',note:'Bound is relative to sampled linework, not unknown original CAD geometry; crossing topology is not certified.'}],proposal:{remove:[e.id],add}});
        }
        return out;
    }};
