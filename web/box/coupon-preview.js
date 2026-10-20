// Display the same nominal profiles as the coupon, without adding marks to cuts.
export function couponPreview(parts){
 const pad=4,gap=12,height=Math.max(...parts.map(p=>p.h)),width=parts.reduce((sum,p)=>sum+p.w,0)+gap+2*pad;
 let x=pad;
 const drawings=parts.map((p,i)=>{const path=[p.p,...p.holes].map(r=>'M'+r.map(([u,v])=>`${u},${p.h-v}`).join(' L')+'Z').join(' '),group=`<g transform="translate(${x} ${pad})"><path d="${path}" fill="#d2b48a" stroke="#88704f" stroke-width="0.3" fill-rule="evenodd"/><text x="${p.w/2}" y="${height+7}" text-anchor="middle" fill="currentColor" font-size="4">${i?'B':'A'} · ${p.w} × ${p.h} mm</text></g>`;x+=p.w+gap;return group;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height+16}" role="img" aria-label="Perfiles rectos de las dos piezas de la probeta, A y B">${drawings}</svg>`;
}
