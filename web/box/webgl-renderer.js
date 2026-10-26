import * as THREE from './vendor/three.module.min.js';
import {panelGeometry,panelMatrix,studioCamera} from './mesh-geometry.js?v=3.5';
import {getMaterialAtlas,materialTiles} from './materials.js?v=3.5';

export class StudioGPU{
 static create(){if(typeof WebGL2RenderingContext==='undefined')return null;try{return new StudioGPU();}catch{return null;}}
 constructor(){
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  this.renderer.setClearColor(0x000000,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera();this.camera.up.set(0,0,1);this.group=new THREE.Group();this.scene.add(this.group);
  this.hemi=new THREE.HemisphereLight(0xdce7fa,0x53505a,1.5);this.hemi.position.set(0,0,1);this.scene.add(this.hemi);
  this.key=new THREE.DirectionalLight(0xffeed6,3.2);this.key.castShadow=true;this.key.shadow.mapSize.set(2048,2048);this.key.shadow.bias=-.00008;this.key.shadow.normalBias=.12;this.key.shadow.radius=3;this.scene.add(this.key);this.scene.add(this.key.target);
  this.fill=new THREE.DirectionalLight(0xc9dcff,.8);this.scene.add(this.fill);
  this.ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({color:0x000000,opacity:.3}));this.ground.receiveShadow=true;this.scene.add(this.ground);
  this.entries=[];this.materials={};this.textures={};this.edgeMaterial=new THREE.MeshStandardMaterial({color:0x654124,roughness:.96,side:THREE.DoubleSide});
  this.jointMaterial=new THREE.LineBasicMaterial({color:0xa8cdb4,depthTest:true,transparent:true,opacity:.75});this.lost=false;
  this.cellGroup=new THREE.Group();this.scene.add(this.cellGroup);this.cellMaterial=new THREE.MeshBasicMaterial({color:0x5fcbbb,transparent:true,opacity:.62,side:THREE.DoubleSide,depthWrite:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});this.cellMeshes=[];
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.onChange?.();});this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.lost=false;this.onChange?.();});
 }
 clear(){for(const e of this.entries){this.group.remove(e.mesh);e.mesh.geometry.dispose();for(const line of e.lines){this.group.remove(line);line.geometry.dispose();}}this.entries=[];}
 setData(parts,t){this.clear();for(const part of parts){const mesh=new THREE.Mesh(panelGeometry(part,t),[this.material('mdf'),this.edgeMaterial]);mesh.castShadow=mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;this.group.add(mesh);const lines=[];for(const index of part.jointHoles||[]){const hole=part.holes[index];for(const z of[0,t]){const points=[...hole,hole[0]].map(([u,v])=>new THREE.Vector3(u,v,z));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),this.jointMaterial);line.matrixAutoUpdate=false;lines.push(line);this.group.add(line);}}this.entries.push({part,mesh,lines});}}
 material(name){if(this.materials[name])return this.materials[name];const colors={mdf:0xc9aa7c,oak:0xccad7b,walnut:0x75513c,birch:0xe4d5ae,white:0xe8e7e2,black:0x303238};const key=String(name).replace(/^plain-/,'');const m=new THREE.MeshStandardMaterial({color:colors[key]??colors.mdf,roughness:key==='white'||key==='black'?.65:.88,metalness:0,side:THREE.DoubleSide,shadowSide:THREE.DoubleSide});this.materials[name]=m;return m;}
 setCellSelection(cells,base,t){for(const mesh of this.cellMeshes){this.cellGroup.remove(mesh);mesh.geometry.dispose();}this.cellMeshes=[];this.cellBaseId=base?.id;for(const ring of cells||[]){const shape=new THREE.Shape(ring.map(p=>new THREE.Vector2(...p))),geometry=new THREE.ShapeGeometry(shape);geometry.translate(0,0,t+.06);const mesh=new THREE.Mesh(geometry,this.cellMaterial);mesh.matrixAutoUpdate=false;this.cellGroup.add(mesh);this.cellMeshes.push(mesh);}}
 updateTextures(){const atlas=getMaterialAtlas();if(!atlas||this.atlas===atlas)return;this.atlas=atlas;const tw=Math.floor(atlas.width/2),th=Math.floor(atlas.height/2);for(const[name,[col,row]]of Object.entries(materialTiles)){const data=new Uint8Array(tw*th*4);for(let y=0;y<th;y++)data.set(atlas.data.subarray(((row*th+y)*atlas.width+col*tw)*4,((row*th+y)*atlas.width+col*tw+tw)*4),y*tw*4);const map=new THREE.DataTexture(data,tw,th,THREE.RGBAFormat);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());map.needsUpdate=true;const mat=this.material(name);mat.map=map;mat.bumpMap=map;mat.bumpScale=name==='mdf'?.035:.075;mat.color.set(0xffffff);mat.needsUpdate=true;this.textures[name]=map;}}
 draw({width,height,dpr,scale,ox,oy,yaw,pitch,max,H,mapping,visible,texture,showJoints,dark,capture,showCells}){
  if(this.lost)return null;this.updateTextures();if(this.pixelRatio!==dpr){this.renderer.setPixelRatio(dpr);this.pixelRatio=dpr;}if(this.width!==width||this.height!==height){this.renderer.setSize(width,height,false);this.width=width;this.height=height;}
  studioCamera(this.camera,{width,height,scale,ox,oy,yaw,pitch,max});
  for(const e of this.entries){e.mesh.visible=visible(e.part);e.mesh.matrix.copy(panelMatrix(mapping,e.part));e.mesh.matrixWorldNeedsUpdate=true;const base=this.material(texture||'mdf');if(e.part.id===this.selectedId&&!capture){if(!this.selectionMaterial||this.selectionBase!==base){this.selectionMaterial?.dispose();this.selectionMaterial=base.clone();this.selectionMaterial.emissive.set(0x356b68);this.selectionMaterial.emissiveIntensity=.38;this.selectionBase=base;}e.mesh.material[0]=this.selectionMaterial;}else e.mesh.material[0]=base;for(const line of e.lines){line.visible=e.mesh.visible&&!!showJoints;line.matrix.copy(e.mesh.matrix);line.matrixWorldNeedsUpdate=true;}}
  this.key.position.set(-max*1.1,-max*.8,max*1.8);this.key.target.position.set(0,0,-H/4);const shadow=this.key.shadow.camera;shadow.left=shadow.bottom=-max*1.8;shadow.right=shadow.top=max*1.8;shadow.near=max*.01;shadow.far=max*7;shadow.updateProjectionMatrix();this.key.shadow.normalBias=max*.00025;
  this.fill.position.set(max*1.4,max*.8,max*.9);this.ground.position.z=-H/2-.3;this.ground.scale.set(max*14,max*14,1);this.ground.material.opacity=dark?.38:.22;
  const cellBase=this.entries.find(e=>e.part.id===this.cellBaseId);this.cellGroup.visible=!!(cellBase&&showCells&&!capture);if(cellBase)for(const mesh of this.cellMeshes){mesh.matrix.copy(panelMatrix(mapping,cellBase.part));mesh.matrixWorldNeedsUpdate=true;}
  this.ground.visible=!capture;this.renderer.render(this.scene,this.camera);return this.renderer.domElement;
 }
}
