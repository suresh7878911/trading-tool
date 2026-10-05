// Index constituents + weights from NSE Indices CSV, with live FYERS prices/changes.
module.exports = async function handler(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,message:"Method not allowed"});}
 const configs={
  nifty50:{name:"NIFTY 50",csv:"https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"},
  bank:{name:"NIFTY BANK",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftybanklist.csv"},
  next50:{name:"NIFTY NEXT 50",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftynext50list.csv"},
  nifty100:{name:"NIFTY 100",csv:"https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv"},
  finserv:{name:"NIFTY FINANCIAL SERVICES",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftyfinservlist.csv"},
  it:{name:"NIFTY IT",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftyitlist.csv"},
  auto:{name:"NIFTY AUTO",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftyautolist.csv"},
  pharma:{name:"NIFTY PHARMA",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftypharmalist.csv"},
  metal:{name:"NIFTY METAL",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftymetallist.csv"},
  psuBank:{name:"NIFTY PSU BANK",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftypsubanklist.csv"},
  privateBank:{name:"NIFTY PRIVATE BANK",csv:"https://www.niftyindices.com/IndexConstituent/ind_niftyprivatebanklist.csv"}
 };
 const key=String(req.query.index||"nifty50");const cfg=configs[key]||configs.nifty50;
 try{
  const cr=await fetch(cfg.csv,{headers:{Accept:"text/csv,application/octet-stream,*/*","User-Agent":"TradingINR/1.0"}});
  if(!cr.ok)throw new Error("NSE constituent file unavailable");
  const csv=await cr.text();
  const lines=csv.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
  if(lines.length<2)throw new Error("No constituent data");
  const parse=s=>{const a=[];let cur="",q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){a.push(cur.trim());cur="";}else cur+=c;}a.push(cur.trim());return a;};
  const rows=lines.map(parse);const headers=rows[0].map(x=>x.toLowerCase().replace(/[^a-z0-9]/g,""));
  const idx=(names)=>names.map(n=>headers.indexOf(n)).find(i=>i>=0);
  const si=idx(["symbol","tradingsymbol"]),wi=idx(["weightage","weight","weightagepercent","weightpercent"]),ni=idx(["companyname","company"]);
  const items=rows.slice(1).map(r=>({symbol:si>=0?r[si]:"",company:ni>=0?r[ni]:"",weight:wi>=0?Number(String(r[wi]).replace(/[% ,]/g,"")):NaN})).filter(x=>x.symbol);
  const raw=req.headers.cookie||"";const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
  const appId=String(process.env.FYERS_APP_ID||"").trim();
  let live=[];
  if(appId&&pair){
   let token="";try{token=decodeURIComponent(pair.slice("fyers_access_token=".length));}catch(_){}
   if(token){
    const fyers=items.map(x=>"NSE:"+x.symbol+"-EQ");
    const qr=await fetch("https://api-t1.fyers.in/data/quotes?symbols="+encodeURIComponent(fyers.join(",")),{headers:{Authorization:appId+":"+token,Accept:"application/json"}});
    const qd=await qr.json().catch(()=>({}));if(qd.s==="ok")live=Array.isArray(qd.d)?qd.d:[];
   }
  }
  const lm=new Map(live.map(x=>{const v=x.v||x;return [String(x.n||x.symbol||"").toUpperCase(),v]}));
  const out=items.map(x=>{const fs="NSE:"+x.symbol+"-EQ";const v=lm.get(fs)||lm.get(x.symbol.toUpperCase())||{};return {...x,fyersSymbol:fs,ltp:Number(v.lp??v.ltp),change:Number(v.ch),changePercent:Number(v.chp)};});
  return res.status(200).json({ok:true,source:"NSE Indices + FYERS",index:key,name:cfg.name,updatedAt:new Date().toISOString(),live:live.length>0,items:out});
 }catch(e){return res.status(502).json({ok:false,message:e.message||"Unable to load index constituents"});}
};