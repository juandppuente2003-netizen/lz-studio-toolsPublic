// Explicit same-site destinations only; never accept arbitrary redirect URLs.
export const entryPages=['index.html','dtf.html','box/index.html','box/index.html?celular=1'];
export function safeNavigationTarget(value,routes){return entryPages.includes(value)||Object.values(routes).includes(value)?value:'dtf.html';}
export function canReturnToTarget(target,state,routes){if(!state||state.profile?.blocked)return false;if(entryPages.includes(target))return true;return state.tools.some(t=>t.enabled!==false&&(routes[t.id]===target||(t.id==='editor'&&['editor.html?tool=remove','premium.html'].includes(target))));}
