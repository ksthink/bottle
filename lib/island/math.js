// 시드 난수와 보간 함수
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function hash2(ix,iz,s){var h=(Math.imul(ix,374761393)+Math.imul(iz,668265263)+Math.imul(s,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296}
export function sm(t){return t*t*(3-2*t)}
export function clamp(v,a,b){return v<a?a:v>b?b:v}
export function lerp(a,b,t){return a+(b-a)*t}
export function smoothstep(a,b,x){var t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)}
