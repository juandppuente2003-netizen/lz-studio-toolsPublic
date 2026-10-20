// One atlas, sampled in physical millimetres on each rigid panel.
export const materialNames={mdf:'MDF natural',oak:'Roble claro',walnut:'Nogal oscuro',birch:'Abedul',white:'Blanco mate',black:'Negro mate'};
export const materialTiles={mdf:[0,0],oak:[1,0],walnut:[0,1],birch:[1,1]};
let atlas=null,pending;
export function loadMaterials(){
 if(pending)return pending;
 if(typeof Image==='undefined')return Promise.resolve(null);
 pending=new Promise(resolve=>{const img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);atlas={width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};resolve(atlas);}catch{resolve(null);}};img.onerror=()=>resolve(null);img.src=new URL('./assets/material-atlas-v1.png',import.meta.url).href;});return pending;
}
export const getMaterialAtlas=()=>atlas;
