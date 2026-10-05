// TradingINR — DhanHQ v2 secure data proxy.
// mode=quote -> market snapshot with LTP/OHLC/OI.
// mode=option-chain -> real-time option chain with OI/Greeks/bid-ask.
// Dhan credentials are never returned to the browser.
module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method==="POST"){
    try{
      const body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});
      if(String(body.mode||"").toLowerCase()!=="strategy")return res.status(405).json({ok:false,error:"Method not allowed"});
      const strategy=String(body.strategy||"").trim(), mode=String(body.strategyMode||"AI-Based");
      if(!strategy)return res.status(400).json({ok:false,message:"Strategy text is required"});
      const find=(rx,fallback)=>(strategy.match(rx)?.[1]||fallback).trim();
      if(process.env.OPENAI_API_KEY){
        const upstream=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization:"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",input:[
          {role:"system",content:"You are TradingINR Strategy AI for Indian equities and F&O. Never place live orders or promise profits. Return JSON keys market,timeframe,entry,exit,risk,confirmations,filters,backtestPlan,warnings,score. Score is rule completeness 0-100, not expected return."},
          {role:"user",content:"Mode: "+mode+"\\nStrategy:\\n"+strategy}
        ],temperature:0.2})});
        const data=await upstream.json().catch(()=>({}));
        if(!upstream.ok)throw Error(data?.error?.message||"AI provider error");
        const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||"").join("")||"";
        let analysis;try{analysis=JSON.parse(text)}catch(_){analysis={market:"Derived",timeframe:"Derived",entry:text,exit:"Review and define",risk:"Define fixed risk",confirmations:"Trend + momentum + volume",filters:"Define session/liquidity filters",backtestPlan:"Use historical OHLCV with brokerage/slippage and out-of-sample validation",warnings:["Review AI output before use"],score:50}};
        return res.status(200).json({ok:true,source:"openai",mode,analysis});
      }
      const analysis={
        market:find(/MARKET\\s*:\\s*(.+)/i,strategy.toUpperCase().includes("BANKNIFTY")?"BANKNIFTY":"NIFTY"),
        timeframe:find(/TIMEFRAME\\s*:\\s*(.+)/i,"Not specified"),
        entry:find(/ENTRY\\s*:\\s*(.+)/i,"Define a precise trigger"),
        exit:find(/EXIT\\s*:\\s*(.+)/i,"Define SL, target and invalidation"),
        risk:find(/(?:RISK|STOP-LOSS|SL)\\s*:\\s*(.+)/i,"Define fixed risk and position sizing"),
        confirmations:"Trend + momentum + volume; add multi-timeframe confirmation",
        filters:"Define session, liquidity and news filters",
        backtestPlan:"Historical OHLCV + brokerage/slippage + out-of-sample validation + max drawdown",
        warnings:["OPENAI_API_KEY is not configured; structured fallback is active, not predictive AI"],
        score:Math.min(100,35+(strategy.match(/ENTRY|EXIT|SL|STOP|TARGET|RISK|TIMEFRAME|MARKET/gi)||[]).length*8)
      };
      return res.status(200).json({ok:true,source:"local-fallback",mode,analysis});
    }catch(e){return res.status(500).json({ok:false,message:e.message||"Strategy analysis failed"});}
  }
  if(req.method!=="GET"){res.setHeader("Allow","GET, POST");return res.status(405).json({ok:false,error:"Method not allowed"});}
  const clientId=process.env.DHAN_CLIENT_ID, accessToken=process.env.DHAN_ACCESS_TOKEN;
  if(!clientId||!accessToken)return res.status(503).json({ok:false,connected:false,message:"Dhan credentials are not configured on the server."});
  const mode=String(req.query.mode||"quote").toLowerCase();
  try{
    if(mode==="quote"){
      const known={
        NIFTY:{exchangeSegment:"IDX_I",securityId:"13",label:"NIFTY 50"},
        BANKNIFTY:{exchangeSegment:"IDX_I",securityId:"25",label:"NIFTY BANK"},
        FINNIFTY:{exchangeSegment:"IDX_I",securityId:"27",label:"NIFTY FIN SERVICE"},
        MIDCPNIFTY:{exchangeSegment:"IDX_I",securityId:"442",label:"NIFTY MIDCAP SELECT"},
        VIX:{exchangeSegment:"IDX_I",securityId:"26",label:"INDIA VIX"},
        SENSEX:{exchangeSegment:"IDX_I",securityId:"1",label:"SENSEX"}
      };
      let custom={};try{custom=JSON.parse(process.env.DHAN_SECURITY_MAP_JSON||"{}");}catch(_){}
      const map={...known,...custom};
      const requested=String(req.query.symbols||"NIFTY,BANKNIFTY").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean).slice(0,100);
      const items=requested.map(symbol=>map[symbol]?{symbol,...map[symbol]}:null).filter(Boolean);
      if(!items.length)return res.status(400).json({ok:false,connected:true,message:"No mapped Dhan symbols requested.",available:Object.keys(map)});
      const grouped={};for(const x of items)(grouped[x.exchangeSegment]||=[]).push(Number(x.securityId));
      const upstream=await fetch("https://api.dhan.co/v2/marketfeed/quote",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json","access-token":accessToken,"client-id":clientId},body:JSON.stringify(grouped)});
      const payload=await upstream.json().catch(()=>null);
      if(!upstream.ok)return res.status(upstream.status===401||upstream.status===403?401:502).json({ok:false,connected:false,message:payload?.errorMessage||"Dhan market quote request failed."});
      const byKey=new Map();for(const [seg,rows] of Object.entries(payload?.data||{}))for(const [id,v] of Object.entries(rows||{}))byKey.set(seg+":"+id,v||{});
      const data=items.map(x=>{const v=byKey.get(x.exchangeSegment+":"+x.securityId)||{},lp=Number(v.last_price),prev=Number(v.ohlc?.close??v.previous_close_price),oi=Number(v.oi),prevOi=Number(v.previous_oi);return{symbol:x.symbol,label:x.label,exchangeSegment:x.exchangeSegment,securityId:String(x.securityId),last_price:Number.isFinite(lp)?lp:null,change:Number.isFinite(lp)&&Number.isFinite(prev)?lp-prev:null,change_percent:Number.isFinite(lp)&&Number.isFinite(prev)&&prev!==0?(lp-prev)/prev*100:null,oi:Number.isFinite(oi)?oi:null,previous_oi:Number.isFinite(prevOi)?prevOi:null,oi_change:Number.isFinite(oi)&&Number.isFinite(prevOi)?oi-prevOi:null,volume:Number.isFinite(Number(v.volume))?Number(v.volume):null,buy_quantity:Number.isFinite(Number(v.buy_quantity))?Number(v.buy_quantity):null,sell_quantity:Number.isFinite(Number(v.sell_quantity))?Number(v.sell_quantity):null,ohlc:v.ohlc||null};});
      return res.status(200).json({ok:true,connected:true,provider:"Dhan",data,serverTime:Date.now()});
    }
    if(mode==="option-chain"){
      const underlyings={NIFTY:{securityId:13,segment:"IDX_I"},BANKNIFTY:{securityId:25,segment:"IDX_I"},FINNIFTY:{securityId:27,segment:"IDX_I"},MIDCPNIFTY:{securityId:442,segment:"IDX_I"}};
      const underlying=String(req.query.underlying||"NIFTY").toUpperCase(),expiry=String(req.query.expiry||"").trim(),u=underlyings[underlying];
      if(!u)return res.status(400).json({ok:false,message:"Unsupported Dhan underlying.",available:Object.keys(underlyings)});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry))return res.status(400).json({ok:false,message:"expiry must be YYYY-MM-DD."});
      const upstream=await fetch("https://api.dhan.co/v2/optionchain",{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json","access-token":accessToken,"client-id":clientId},body:JSON.stringify({UnderlyingScrip:u.securityId,UnderlyingSeg:u.segment,Expiry:expiry})});
      const payload=await upstream.json().catch(()=>null);
      if(!upstream.ok)return res.status(upstream.status===401||upstream.status===403?401:502).json({ok:false,connected:false,message:payload?.errorMessage||"Dhan option-chain request failed."});
      return res.status(200).json({ok:true,connected:true,provider:"Dhan",underlying,expiry,data:payload?.data||null,serverTime:Date.now()});
    }
    return res.status(400).json({ok:false,message:"Unknown mode. Use quote or option-chain."});
  }catch(_){return res.status(502).json({ok:false,connected:false,message:"Could not reach Dhan data API."});}
};