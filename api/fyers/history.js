// Server-side FYERS historical candle proxy. Access tokens never leave the server.
module.exports = async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,message:"Method not allowed"});}
 const appId=String(process.env.FYERS_APP_ID||"").trim();
 const raw=req.headers.cookie||"";
 const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
 if(!appId||!pair)return res.status(401).json({ok:false,message:"FYERS connection required"});
 let token;try{token=decodeURIComponent(pair.slice("fyers_access_token=".length));}catch(e){return res.status(401).json({ok:false,message:"Invalid session"});}
 // Optional research-only 5-minute S/R backtest; routed here to stay within Vercel Hobby function limits.
 if(String(req.query.backtest||"")==="1"){
  const days=Math.max(30,Math.min(365,Number(req.query.days||365))),end=new Date();end.setUTCHours(0,0,0,0);
  const start=new Date(end.getTime()-days*86400000),iso=d=>d.toISOString().slice(0,10),all=[];
  try{
   for(let cur=new Date(start);cur<=end;){const ce=new Date(Math.min(cur.getTime()+89*86400000,end.getTime()));
    const qs=new URLSearchParams({symbol:"NSE:NIFTY50-INDEX",resolution:"5",date_format:"1",range_from:iso(cur),range_to:iso(ce),cont_flag:"1"});
    const up=await fetch("https://api-t1.fyers.in/data/history?"+qs,{headers:{Authorization:appId+":"+token,Accept:"application/json"}});
    const d=await up.json().catch(()=>({}));if(!up.ok||d.s!=="ok")return res.status(up.status||502).json({ok:false,message:"FYERS history request failed",code:d.code});
    all.push(...(d.candles||[]));cur=new Date(ce.getTime()+86400000);
   }
  }catch(e){return res.status(502).json({ok:false,message:"Unable to reach FYERS historical data"});}
  const candles=Array.from(new Map(all.map(c=>[c[0],c])).values()).sort((a,b)=>a[0]-b[0]),n=candles.length;
  if(n<100)return res.status(422).json({ok:false,message:"Not enough 5-minute candles",candles:n});
  const atr=Array(n).fill(null),supports=Array(n).fill(null),resists=Array(n).fill(null);let sup=null,resis=null;
  for(let i=0;i<n;i++){
   if(i>=13){let s=0;for(let j=i-13;j<=i;j++){const pc=j?candles[j-1][4]:candles[j][4];s+=Math.max(candles[j][2]-candles[j][3],Math.abs(candles[j][2]-pc),Math.abs(candles[j][3]-pc));}atr[i]=s/14;}
   if(i>=6){const p=i-3,hi=candles[p][2],lo=candles[p][3];let ih=true,il=true;for(let j=p-3;j<=p+3;j++)if(j!==p){if(candles[j][2]>=hi)ih=false;if(candles[j][3]<=lo)il=false;}if(ih)resis=hi;if(il)sup=lo;}
   supports[i]=sup;resists[i]=resis;
  }
  function test(mode){const ts=[];let pos=null;
   for(let i=1;i<n;i++){const c=candles[i],p=candles[i-1],a=atr[i];
    if(pos){let x=null,r="";if(pos.side==="LONG"){if(c[3]<=pos.sl){x=pos.sl;r="SL";}else if(c[2]>=pos.tp){x=pos.tp;r="TP";}}else{if(c[2]>=pos.sl){x=pos.sl;r="SL";}else if(c[3]<=pos.tp){x=pos.tp;r="TP";}}
     if(x!==null){const pts=pos.side==="LONG"?x-pos.entry:pos.entry-x;ts.push({side:pos.side,entryTime:pos.time,exitTime:c[0],entry:pos.entry,exit:x,reason:r,points:pts});pos=null;continue;}}
    if(pos||a===null||supports[i]===null||resists[i]===null||supports[i-1]===null||resists[i-1]===null)continue;
    let b=false,s=false;if(mode==="Breakout"){b=c[4]>resists[i]&&p[4]<=resists[i-1];s=c[4]<supports[i]&&p[4]>=supports[i-1];}
    else{const t=.2*a;b=c[3]<=supports[i]+t&&c[4]>supports[i]&&c[4]>c[1];s=c[2]>=resists[i]-t&&c[4]<resists[i]&&c[4]<c[1];}
    if(b)pos={side:"LONG",entry:c[4],time:c[0],sl:c[4]-1.5*a,tp:c[4]+2*a};else if(s)pos={side:"SHORT",entry:c[4],time:c[0],sl:c[4]+1.5*a,tp:c[4]-2*a};
   }
   const gp=ts.filter(t=>t.points>0).reduce((a,t)=>a+t.points,0),gl=-ts.filter(t=>t.points<0).reduce((a,t)=>a+t.points,0);let eq=0,peak=0,dd=0;
   for(const t of ts){eq+=t.points;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
   return {mode,trades:ts.length,winRatePct:ts.length?Math.round(ts.filter(t=>t.points>0).length/ts.length*10000)/100:0,netPoints:Math.round(ts.reduce((a,t)=>a+t.points,0)*100)/100,profitFactor:gl?Math.round(gp/gl*1000)/1000:null,maxDrawdownPoints:Math.round(dd*100)/100,tradeList:ts};
  }
  return res.status(200).json({ok:true,source:"FYERS",symbol:"NSE:NIFTY50-INDEX",resolution:"5",from:iso(start),to:iso(end),candles:n,warning:"Research baseline only; brokerage, taxes and realistic slippage excluded.",results:[test("Breakout"),test("Bounce")]});
 }
 const symbols={nifty:"NSE:NIFTY50-INDEX",banknifty:"NSE:NIFTYBANK-INDEX",sensex:"BSE:SENSEX-INDEX",vix:"NSE:INDIAVIX-INDEX",finnifty:"NSE:FINNIFTY-INDEX",midcpnifty:"NSE:MIDCPNIFTY-INDEX",niftyit:"NSE:NIFTYIT-INDEX",next50:"NSE:NIFTYNXT50-INDEX"};
 const symbol=symbols[String(req.query.symbol||"nifty").toLowerCase()];
 if(!symbol)return res.status(400).json({ok:false,message:"Unsupported chart symbol"});
 const allowedRes={ "1":"1","5":"5","15":"15","1h":"60","4h":"240","1D":"D","1W":"W" };
 const resolution=allowedRes[String(req.query.resolution||"15")]||"15";
 const to=new Date(); const days=resolution==="W"?730:resolution==="D"?365:resolution==="240"?90:resolution==="60"?30:7;
 const from=new Date(to.getTime()-days*86400000);
 const iso=d=>d.toISOString().slice(0,10);
 const qs=new URLSearchParams({symbol,resolution,date_format:"1",range_from:iso(from),range_to:iso(to),cont_flag:"1"});
 try{
  const upstream=await fetch("https://api-t1.fyers.in/data/history?"+qs.toString(),{headers:{Authorization:appId+":"+token,Accept:"application/json"}});
  const data=await upstream.json().catch(()=>({}));
  if((upstream.status===401||[-8,-15,-16,-17].includes(Number(data.code))))res.setHeader("Set-Cookie","fyers_access_token=; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  if(!upstream.ok||data.s!=="ok")return res.status(upstream.status||502).json({ok:false,message:"FYERS history request failed",code:data.code});
  return res.status(200).json({ok:true,source:"FYERS",symbol,resolution,receivedAt:new Date().toISOString(),candles:data.candles||[]});
 }catch(e){return res.status(502).json({ok:false,message:"Unable to reach FYERS historical data"});}
};