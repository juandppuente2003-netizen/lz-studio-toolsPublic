// Restore the route supplied by Vercel's rewrite before running the same access checks.
export function routedRequest(request){
 const url=new URL(request.url),routes=url.searchParams.getAll('__lz_path');
 if(routes.length){const route=routes.at(-1);url.pathname='/'+route.replace(/^\/+/, '');url.searchParams.delete('__lz_path');return new Request(url,request);}
 return request;
}
export function vercelHandler(handler){return {fetch(request){return handler.fetch(routedRequest(request));}};}
