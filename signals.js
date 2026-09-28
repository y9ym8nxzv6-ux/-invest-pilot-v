'use strict';
const IPSignals = (() => {
  function classify(x){
    const s=Number(x.technical_score)||0, r5=Number(x.ret5), r20=Number(x.ret20), r60=Number(x.ret60), trend=Number(x.trend_count)||0;
    const reasons=[];
    if(trend>=3) reasons.push('中期上昇');
    if(Number.isFinite(r20)){
      if(r20>0.15) reasons.push('短期過熱');
      else if(r20>=-0.05&&r20<=0.10) reasons.push('過熱感小');
      else if(r20<-0.10) reasons.push('調整中');
    }
    if(Number.isFinite(r5)){
      if(r5>0.06) reasons.push('直近急伸');
      if(r5<-0.05) reasons.push('直近反落');
    }
    if(Number.isFinite(r60)&&r60<0) reasons.push('60日弱い');
    let key='watch',label='🔵 監視';
    if(s>=80&&trend>=3&&Number.isFinite(r20)&&r20>=-0.05&&r20<=0.12&&(!Number.isFinite(r5)||r5<=0.05)){key='buy';label='🟢 買い候補'}
    else if(s>=78&&trend>=3&&((Number.isFinite(r20)&&r20>0.12)||(Number.isFinite(r5)&&r5>0.05))){key='wait';label='🟡 押し目待ち'}
    else if(s<60||trend<=1||(Number.isFinite(r60)&&r60<-0.10)){key='avoid';label='🔴 見送り'}
    return {key,label,reason:reasons.slice(0,2).join('・')||'条件確認中'};
  }
  return {classify};
})();
globalThis.IPSignals=IPSignals;
