import * as THREE from './vendor/three.module.min.js';
// Geometry is built directly from the nominal cut contours. No visual bevels,
// filled holes, or enlarged tenons: the drawing and assembled solid agree.
export function panelGeometry(part,thickness){
 const shape=new THREE.Shape(part.p.map(p=>new THREE.Vector2(...p)));
 for(const hole of part.holes||[])shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(...p))));
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,steps:1,bevelEnabled:false,curveSegments:1});
 const uv=geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/160,uv.getY(i)/160);
 geometry.computeBoundingBox();return geometry;
}
export function panelMatrix(mapping,part){const o=mapping(part,0,0,0),u=mapping(part,1,0,0),v=mapping(part,0,1,0),n=mapping(part,0,0,1);return new THREE.Matrix4().set(u[0]-o[0],v[0]-o[0],n[0]-o[0],o[0],u[1]-o[1],v[1]-o[1],n[1]-o[1],o[1],u[2]-o[2],v[2]-o[2],n[2]-o[2],o[2],0,0,0,1);}
export function studioCamera(camera,{width,height,scale,ox,oy,yaw,pitch,max}){
 const cp=Math.cos(pitch),sp=Math.sin(pitch),sy=Math.sin(yaw),co=Math.cos(yaw),distance=max*8;
 camera.up.set(0,0,1);camera.position.set(-sy*cp*distance,-co*cp*distance,sp*distance);camera.lookAt(0,0,0);
 camera.left=-ox/scale;camera.right=(width-ox)/scale;camera.top=oy/scale;camera.bottom=(oy-height)/scale;camera.near=max*.01;camera.far=max*20;camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
