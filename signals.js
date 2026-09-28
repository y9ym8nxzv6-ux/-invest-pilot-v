'use strict';
const IPSignals = (() => {
  function classify(x){
    const s=Number(x.technical_score)||0;
    const r5=Number(x.ret5), r20=Number(x.ret20), r60=Number(x.ret60);
    const trend=Number(x.trend_count)||0;
    const fc=x.forecast20||null;
    const upRate=fc&&Number.isFinite(Number(fc.up_rate))?Number(fc.up_rate):null;
    const median=fc&&Number.isFinite(Number(fc.median))?Number(fc.median):null;
    const reasons=[];

    if(trend===4) reasons.push('上昇トレンド強い');
    else if(trend>=3) reasons.push('中期上昇');
    else if(trend<=1) reasons.push('トレンド弱い');

    if(Number.isFinite(r20)){
      if(r20>0.15) reasons.push('短期過熱');
      else if(r20>=-0.05&&r20<=0.10) reasons.push('過熱感小');
      else if(r20<-0.10) reasons.push('調整中');
    }
    if(Number.isFinite(r5)){
      if(r5>0.06) reasons.push('直近急伸');
      else if(r5<-0.05) reasons.push('直近反落');
    }
    if(upRate!==null){
      if(upRate>=0.68&&median!==null&&median>0) reasons.push('類似局面強い');
      else if(upRate<=0.35&&median!==null&&median<0) reasons.push('類似局面弱い');
    }

    let key='watch',label='🔵 監視';

    const strongBuyBase=s>=90&&trend===4&&Number.isFinite(r20)&&r20>=-0.03&&r20<=0.10&&(!Number.isFinite(r5)||r5<=0.04);
    const strongBuyForecast=upRate===null||(upRate>=0.62&&median!==null&&median>0);
    if(strongBuyBase&&strongBuyForecast){
      key='strongbuy'; label='🚀 積極買い';
    } else if(s>=80&&trend>=3&&Number.isFinite(r20)&&r20>=-0.05&&r20<=0.12&&(!Number.isFinite(r5)||r5<=0.05)){
      key='buy'; label='🟢 買い候補';
    } else if(s>=78&&trend>=3&&((Number.isFinite(r20)&&r20>0.12)||(Number.isFinite(r5)&&r5>0.05))){
      key='wait'; label='🟡 押し目待ち';
    } else {
      const strongSellBase=s<42&&trend===0&&Number.isFinite(r20)&&r20<-0.12&&Number.isFinite(r60)&&r60<-0.15;
      const strongSellForecast=upRate===null||(upRate<=0.38&&median!==null&&median<0);
      if(strongSellBase&&strongSellForecast){
        key='strongsell'; label='⛔ 積極売り';
      } else if(s<60||trend<=1||(Number.isFinite(r60)&&r60<-0.10)){
        key='avoid'; label='🔴 見送り';
      }
    }
    return {key,label,reason:reasons.slice(0,2).join('・')||'条件確認中'};
  }
  return {classify};
})();
globalThis.IPSignals=IPSignals;
