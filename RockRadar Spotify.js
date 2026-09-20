// RockRadar Spotify.js
// OAuth Spotify Authorization Code + PKCE. Segredos/tokens ficam somente no Keychain do iPhone.
const SPOTIFY_VERSION="1.3.0";
let logger=null;
try{logger=importModule("logger").createLogger("RockRadar Spotify.js")}catch{}
function slog(level,msg,meta){try{logger&&logger[level.toLowerCase()]&&logger[level.toLowerCase()](msg,meta)}catch{} try{console.log("["+level+"] "+msg+(meta?" "+JSON.stringify(meta):""))}catch{}}
function safeErr(e){return {name:(e&&e.name)||"Error",message:String((e&&e.message)||e),stack:String((e&&e.stack)||"")}}
slog("INFO","Inicializando Spotify PKCE");
const CLIENT_ID="2c3cf76b21ce46c09487907fe4fa2de7";
const REDIRECT_URI="https://aeternare-spotify-callback-production.up.railway.app/spotify/callback";
const SCOPE="playlist-modify-private playlist-read-private";
const K={verifier:"rockradar.spotify.v2.verifier",state:"rockradar.spotify.v2.state",access:"rockradar.spotify.v2.access",refresh:"rockradar.spotify.v2.refresh",expires:"rockradar.spotify.v2.expires",playlist:"rockradar.spotify.playlist"};
function b64url(data){return data.toBase64String().replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function sha256Bytes(ascii){
  var rightRotate=function(value,amount){return (value>>>amount)|(value<<(32-amount));};
  var mathPow=Math.pow,maxWord=mathPow(2,32),lengthProperty="length",i,j,result="";
  var words=[],asciiBitLength=ascii[lengthProperty]*8;
  var hash=[],k=[],primeCounter=0,isComposite={};
  for(var candidate=2;primeCounter<64;candidate++){
    if(!isComposite[candidate]){
      for(i=0;i<313;i+=candidate)isComposite[i]=candidate;
      hash[primeCounter]=(mathPow(candidate,.5)*maxWord)|0;
      k[primeCounter++]=(mathPow(candidate,1/3)*maxWord)|0;
    }
  }
  ascii+="\x80";
  while(ascii[lengthProperty]%64-56)ascii+="\x00";
  for(i=0;i<ascii[lengthProperty];i++){
    j=ascii.charCodeAt(i);
    if(j>>8)throw new Error("PKCE verifier não ASCII");
    words[i>>2]|=j<<((3-i)%4)*8;
  }
  words[words[lengthProperty]]=((asciiBitLength/maxWord)|0);
  words[words[lengthProperty]]=asciiBitLength;
  for(j=0;j<words[lengthProperty];){
    var w=words.slice(j,j+=16),oldHash=hash.slice(0),hh=hash.slice(0);
    for(i=0;i<64;i++){
      var w15=w[i-15],w2=w[i-2];
      var wi=i<16?w[i]:(w[i-16]+(rightRotate(w15,7)^rightRotate(w15,18)^(w15>>>3))+w[i-7]+(rightRotate(w2,17)^rightRotate(w2,19)^(w2>>>10)))|0;
      w[i]=wi;
      var A=hh[0],E=hh[4];
      var temp1=(hh[7]+(rightRotate(E,6)^rightRotate(E,11)^rightRotate(E,25))+((E&hh[5])^((~E)&hh[6]))+k[i]+wi)|0;
      var temp2=((rightRotate(A,2)^rightRotate(A,13)^rightRotate(A,22))+((A&hh[1])^(A&hh[2])^(hh[1]&hh[2])))|0;
      hh=[(temp1+temp2)|0,A,hh[1],hh[2],(hh[3]+temp1)|0,E,hh[5],hh[6]];
    }
    for(i=0;i<8;i++)hash[i]=(hh[i]+oldHash[i])|0;
  }
  var bytes=[];
  for(i=0;i<8;i++)for(j=3;j+1;j--)bytes.push((hash[i]>>(j*8))&255);
  return bytes;
}
async function sha256(data){
  slog("INFO","PKCE: SHA-256 JS compacto");
  var bytes=sha256Bytes(data.toRawString());
  if(bytes.length!==32)throw new Error("SHA-256 inválido");
  slog("INFO","PKCE: SHA-256 concluído");
  return Data.fromBytes(bytes);
}
function randomVerifier(){return b64url(Data.fromString(Array.from({length:64},()=>String.fromCharCode(33+Math.floor(Math.random()*94))).join("")))}
function qs(o){return Object.entries(o).map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&")}
async function beginAuth(){
 slog("INFO","OAuth: preparando autorização");
 const verifier=randomVerifier(), state=randomVerifier().slice(0,32);
 Keychain.set(K.verifier,verifier);Keychain.set(K.state,state);
 const challenge=b64url(await sha256(Data.fromString(verifier)));
 const u="https://accounts.spotify.com/authorize?"+qs({client_id:CLIENT_ID,response_type:"code",redirect_uri:REDIRECT_URI,scope:SCOPE,code_challenge_method:"S256",code_challenge:challenge,state});
 slog("INFO","OAuth: abrindo autorização Spotify",{redirect:REDIRECT_URI,scope:SCOPE});
 Safari.open(u);
}
async function token(body){
 slog("INFO","OAuth: solicitando token",{grant_type:body.grant_type});
 const r=new Request("https://accounts.spotify.com/api/token");r.method="POST";
 r.headers={"Content-Type":"application/x-www-form-urlencoded"};r.body=qs(body);
 const j=await r.loadJSON();if(!j.access_token)throw new Error(j.error_description||j.error||"Falha ao obter token");
 Keychain.set(K.access,j.access_token);Keychain.set(K.expires,String(Date.now()+((j.expires_in||3600)-60)*1000));
 if(j.refresh_token)Keychain.set(K.refresh,j.refresh_token);return j.access_token;
}
async function callback(q){
 slog("INFO","OAuth: callback recebido",{hasCode:!!q.code,hasState:!!q.state,error:q.error||null});
 if(q.error)throw new Error("Spotify: "+q.error);
 if(!q.code) return false;
 if(!Keychain.contains(K.state)||q.state!==Keychain.get(K.state))throw new Error("Estado OAuth inválido");
 const verifier=Keychain.get(K.verifier);
 await token({client_id:CLIENT_ID,grant_type:"authorization_code",code:q.code,redirect_uri:REDIRECT_URI,code_verifier:verifier});
 if(Keychain.contains(K.verifier))Keychain.remove(K.verifier);if(Keychain.contains(K.state))Keychain.remove(K.state);
 return true;
}
async function access(){
 if(Keychain.contains(K.access)&&Number(Keychain.get(K.expires)||0)>Date.now())return Keychain.get(K.access);
 if(!Keychain.contains(K.refresh))return null;
 return await token({client_id:CLIENT_ID,grant_type:"refresh_token",refresh_token:Keychain.get(K.refresh)});
}
async function api(path,method="GET",body=null){
 const t=await access();if(!t)throw new Error("NOT_AUTH");
 const r=new Request("https://api.spotify.com/v1"+path);r.method=method;r.headers={Authorization:"Bearer "+t,"Content-Type":"application/json"};
 if(body!==null)r.body=JSON.stringify(body);const j=await r.loadJSON();if(r.response.statusCode>=400)throw new Error((j.error&&j.error.message)||"Spotify HTTP "+r.response.statusCode);return j;
}
async function playlist(){
 if(Keychain.contains(K.playlist))return Keychain.get(K.playlist);
 const p=await api("/me/playlists","POST",{name:"Rock Radar — Descobertas",description:"Descobertas do Rock Radar para ouvir depois.",public:false});
 Keychain.set(K.playlist,p.id);return p.id;
}
function normText(x){return String(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function scoreTrack(tr,artist,title){
 const a=normText(artist),t=normText(title),ta=normText((tr.artists||[]).map(x=>x.name).join(" ")),tt=normText(tr.name);let score=0;
 if(a&&ta===a)score+=60;else if(a&&(ta.includes(a)||a.includes(ta)))score+=40;
 for(const w of t.split(" ").filter(x=>x.length>2))if(tt.includes(w))score+=5;
 if(t&&tt===t)score+=35;return score;
}
async function inPlaylist(id,uri){
 for(let offset=0;offset<500;offset+=50){
  const page=await api("/playlists/"+id+"/items?"+qs({limit:"50",offset:String(offset)}));
  const list=page.items||[];
  if(list.some(x=>{const it=x.item||x.track;return it&&it.uri===uri}))return true;
  if(!page.next||list.length<50)break;
 }return false;
}
function saveAdded(tr){
 try{const fm=FileManager.iCloud(),dir=fm.joinPath(fm.documentsDirectory(),"RockRadar");if(!fm.fileExists(dir))fm.createDirectory(dir,true);const path=fm.joinPath(dir,"spotify-state.json");let st={added:{}};try{if(fm.fileExists(path))st=JSON.parse(fm.readString(path))}catch{}if(!st.added)st.added={};st.added[tr.uri]={name:tr.name,artist:(tr.artists||[]).map(x=>x.name).join(", "),at:new Date().toISOString()};fm.writeString(path,JSON.stringify(st,null,2))}catch(e){slog("WARN","Estado local Spotify não foi salvo")}
}
async function addDiscovery(artist,title){
 artist=String(artist||"").trim();
 if(!artist)throw new Error("Não consegui identificar a banda. Nenhuma música foi adicionada.");
 const found=await api("/search?"+qs({q:artist,type:"artist",limit:"5"}));
 const artists=found.artists&&found.artists.items||[];
 const wanted=normText(artist);
 const ar=artists.find(x=>normText(x.name)===wanted);
 if(!ar)throw new Error("Não consegui confirmar a banda "+artist+" no Spotify. Nenhuma música foi adicionada.");
 const top=await api("/artists/"+ar.id+"/top-tracks");
 const tracks=(top.tracks||[]).filter(x=>(x.artists||[]).some(y=>y.id===ar.id));
 if(!tracks.length)throw new Error("O Spotify não retornou músicas populares de "+ar.name+".");
 const tr=tracks[0],id=await playlist();
 if(await inPlaylist(id,tr.uri)){saveAdded(tr);return {track:tr,duplicate:true}}
 await api("/playlists/"+id+"/items","POST",{uris:[tr.uri]});saveAdded(tr);return {track:tr,duplicate:false};
}
const q=args.queryParameters||{};
try{
 if(await callback(q)){const a=new Alert();a.title="Spotify conectado";a.message="Rock Radar já pode usar sua playlist privada de descobertas.";a.addAction("OK");await a.presentAlert();}
 else if(q.action==="add"&&(q.q||q.title||q.artist)){let t=await access();if(!t){await beginAuth()}else{const result=await addDiscovery(q.artist||"",q.title||q.q||"");const tr=result.track;const a=new Alert();a.title=result.duplicate?"Já está na playlist":"Adicionado às Descobertas";a.message=(tr.artists||[]).map(x=>x.name).join(", ")+" — "+tr.name;a.addAction("OK");await a.presentAlert();}}
 else if(!(await access())) await beginAuth();
 else {const id=await playlist();const a=new Alert();a.title="Rock Radar Spotify";a.message="Conectado. Playlist Rock Radar — Descobertas pronta.\n\nID: "+id;a.addAction("OK");await a.presentAlert();}
}catch(e){slog("ERROR","Falha no Spotify",safeErr(e));const a=new Alert();a.title="Rock Radar Spotify";a.message=String(e).includes("NOT_AUTH")?"É preciso conectar sua conta Spotify.":String(e);a.addAction("OK");await a.presentAlert();}
Script.complete();
