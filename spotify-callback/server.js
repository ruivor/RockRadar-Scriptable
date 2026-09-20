const http=require("http");const port=process.env.PORT||3000;
http.createServer((req,res)=>{const u=new URL(req.url,"http://x");
if(u.pathname==="/health"){res.writeHead(200);return res.end("ok")}
if(u.pathname!=="/spotify/callback"){res.writeHead(404);return res.end("Not found")}
const p=new URLSearchParams();for(const k of ["code","state","error"])if(u.searchParams.get(k))p.set(k,u.searchParams.get(k));
const target="scriptable:///run/RockRadar%20Spotify?"+p.toString();
res.writeHead(302,{Location:target,"Cache-Control":"no-store"});res.end();
}).listen(port,"0.0.0.0");
