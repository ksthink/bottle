// 섬 3D 화면 전체. 시제품(prototype/index.html)의 스크립트를 그대로 옮겼다.
// 화면 요소는 components/Island.tsx 가 같은 id로 그려 두고, 여기서 id로 찾아 쓴다.
import * as THREE from 'three';
import { patchToonShading } from './toon';
import { RULES, SAMPLES } from './letters';
import { mulberry32, hash2, sm, clamp, lerp, smoothstep } from './math';
import { hasContact } from './filter';
import { tideAngle, windAngle as envWind, windStrength, weatherKind } from './env';

let started = false;
// seed: 섬 시드(10000~99999). 회원은 서버에 저장된 값, 비회원은 접속마다 새로 받은 값
// net: 서버와 주고받는 길(lib/net.ts). 없으면 시제품처럼 화면 안에서만 병이 오간다
// born: 섬이 생긴 시각(ms). 'N일째'를 센다
export function startIsland(islandSeed, net, born, member) {
if (started) return;
started = true;
var NET = net || null;
// 원칙: 편지는 가입한 회원만 보낸다. 비회원(손님·오프라인)은 받은 편지를 읽기만 한다. 그래서 신고된 편지에는 늘 보낸 사람의 이메일이 있다(서버 /api/throw·throw_bottle도 막는다)
var CAN_WRITE = !!member;
var BORN = born || Date.now();
// 섬에 온 지 며칠째인가 (회원은 섬이 생긴 날부터, 손님은 늘 1일째)
function islandDay(){return Math.floor((Date.now()-BORN)/864e5)+1}
patchToonShading();
var $=function(id){return document.getElementById(id)};



var DAY=86400;              // 실제 하루 (기기의 현지 시간 기준)
// state.t = 오늘(현지) 06:00부터 흐른 초. 해 위상 0 = 06:00, .25 = 12:00, .5 = 18:00, .75 = 00:00
function kstT(){var d=new Date(),s=d.getHours()*3600+d.getMinutes()*60+d.getSeconds()+d.getMilliseconds()/1000;return (s-6*3600+86400)%86400}
var CLOCK_FMT=(function(){try{return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',hour:'numeric',minute:'2-digit'})}catch(e){return null}})();
function clockText(){var d=new Date();return CLOCK_FMT?CLOCK_FMT.format(d):d.toLocaleString()}
// 모바일에서 보이는 짧은 시각: 2026-11-14(토) 21:34
var CL_DAYS=['일','월','화','수','목','금','토'];
function clockShort(){var d=new Date(),p2=function(n){return(n<10?'0':'')+n};return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+'('+CL_DAYS[d.getDay()]+') '+p2(d.getHours())+':'+p2(d.getMinutes())}
// 왼쪽 위 시각: PC는 긴 꼴(.cl-l), 모바일은 짧은 꼴(.cl-s). 어느 쪽을 보일지는 CSS가 정한다
function setClock(){var el=document.getElementById('clock');if(!el)return;var l=el.querySelector('.cl-l'),s=el.querySelector('.cl-s');if(l)l.textContent=clockText();if(s)s.textContent=clockShort()}
setClock();
var T0=kstT(), P0=performance.now();
var DIRS=['북','북동','동','남동','남','남서','서','북서'];
function bearingName(x,z){var b=Math.atan2(x,-z); if(b<0)b+=Math.PI*2; return DIRS[Math.round(b/(Math.PI/4))%8]}

var canvas=$('scene'), renderer;
try{ renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true}); }catch(e){ $('fail').hidden=false; return; }
// 레티나에서 2배로 그리면 물·하늘 셰이더가 픽셀 수만큼 무거워져 프레임이 떨어진다. 1.5배까지만 쓴다
var PR=Math.min(window.devicePixelRatio||1,1.5);
renderer.setPixelRatio(PR);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
var V3=THREE.Vector3;
function col(hex){return new THREE.Color(hex).convertSRGBToLinear()}
function mat(hex,o){o=o||{};o.color=col(hex);if(o.roughness===undefined)o.roughness=.78;if(o.metalness===undefined)o.metalness=0;return new THREE.MeshStandardMaterial(o)}
function add(parent,geo,m,x,y,z){var o=new THREE.Mesh(geo,m);o.position.set(x||0,y||0,z||0);parent.add(o);return o}
var scene=new THREE.Scene();
var camera=new THREE.PerspectiveCamera(46,1,0.5,1500);
scene.fog=new THREE.Fog(0xa9dcec,170,640);
var hemi=new THREE.HemisphereLight(col(0xeef8ff),col(0xe0cfa2),0.55); scene.add(hemi);
var sun=new THREE.DirectionalLight(col(0xfff2dc),0.75); sun.castShadow=true;
var coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
sun.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);
(function(c){c.left=-55;c.right=55;c.top=55;c.bottom=-55;c.near=1;c.far=420})(sun.shadow.camera);
sun.shadow.bias=-0.0006; sun.shadow.normalBias=0.5; scene.add(sun); scene.add(sun.target);
var sunBall=new THREE.Mesh(new THREE.SphereGeometry(11,20,14),new THREE.MeshBasicMaterial({color:col(0xffe9b8),fog:false})); scene.add(sunBall);

// 모닥불 빛, 불빛 번짐, 별
// 모닥불 빛: 따뜻한 호박색. 12m까지만 닿고 2m 76%·6m 35%·10m 7%로 서서히 어두워진다
var fireLight=new THREE.PointLight(col(0xffb040),0,12,1.5); scene.add(fireLight);
if(!coarse){fireLight.castShadow=true;fireLight.shadow.mapSize.set(512,512);fireLight.shadow.camera.near=.3;fireLight.shadow.camera.far=30;fireLight.shadow.bias=-0.004;fireLight.shadow.radius=4}
var GLOW_TEX=(function(){var c=document.createElement('canvas');c.width=c.height=64;var x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
// 밤하늘: 밝은 별은 실제 적경·적위와 밝기로 놓아 별자리 모양이 그대로 보이게 하고, 은하수는 은하 좌표로 그린다. 섬은 북위 24도쯤에 있다고 본다
var SKY_LAT=0.42, SKY_M=[0,Math.cos(SKY_LAT),Math.sin(SKY_LAT)], SKY_P=[0,Math.sin(SKY_LAT),-Math.cos(SKY_LAT)];
var SKY_GLSL=['uniform float uLST,uNight,uTime;',
  'const vec3 SM=vec3('+SKY_M.map(function(v){return v.toFixed(6)}).join(',')+'),SP=vec3('+SKY_P.map(function(v){return v.toFixed(6)}).join(',')+'),SW=vec3(-1.,0.,0.);',
  'const mat3 EQ2GAL=mat3(-0.0548755604,0.4941094279,-0.8676661490,-0.8734370902,-0.4448296300,-0.1980763734,-0.4838350155,0.7469822445,0.4559837762);'].join('\n');
var skyU={uLST:{value:0},uNight:{value:0},uTime:{value:0},uPR:{value:PR}};
// 하늘 빛: 천정은 짙고 수평선으로 갈수록 밝아지며, 수평선에는 가늘게 빛나는 띠가 선다. 바다도 같은 하늘을 비춘다 (선형 색)
// 화면 한 픽셀이 거리 1에서 몇 픽셀인지(세로 기준). 거리/uPx가 그 자리의 한 픽셀 크기(m)다
var PXU={value:800};
// 거품 기포: 작은 셀마다 둥근 기포가 하나씩 있거나 없다. 거품 양(amt)이 많을수록 기포가 늘고 커지며, 짙으면 하얀 띠로 메워진다
// 기포가 한 픽셀보다 작아지는 먼 곳에서는 셀의 평균 덮임으로 바꿔 지글거리지 않게 한다
var BUB_GLSL=['float bh(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*45758.5453);}',
  'float bubL(vec2 p,float cs,float amt,float fp){vec2 q=p/cs,i=floor(q),f=fract(q);vec2 c=.3+.4*vec2(bh(i+17.3),bh(i+41.7));',
  '  float pr=min(amt*1.3,1.),r=(.16+.16*bh(i+7.1))*(.35+.65*amt),aa=fp/cs;',
  '  float b=step(bh(i),pr)*(1.-smoothstep(r-aa*.5,r+aa*.5,length(f-c)));return mix(b,pr*3.1416*r*r,smoothstep(.2,.6,aa));}',
  'float bubbles(vec2 p,float amt,float fp){if(amt<.01)return 0.;float a=bubL(p,.16,amt,fp),b=bubL(p+vec2(.37,.71),.09,amt,fp);return max(1.-(1.-a)*(1.-b),smoothstep(.72,.95,amt));}',''].join('\n');
var SKYG={uZen:{value:new THREE.Color()},uHor:{value:new THREE.Color()},uGlow:{value:new THREE.Color()}};
var SKYG_GLSL='uniform vec3 uZen,uHor,uGlow;\nvec3 skyGrad(vec3 d){float y=d.y;vec3 c=mix(uHor,uZen,pow(smoothstep(0.,.55,max(y,0.)),.55));return c+uGlow*(exp(-abs(y)*90.)+exp(-max(y,0.)*9.)*.38);}\n';
// [적경(시), 적위(도), 등급, 색: 0 흰색 1 푸른 흰색 2 노란색 3 주황 4 붉은 주황]
var BRIGHT=[[18.62,38.78,.03,1],[19.85,8.87,.77,0],[20.69,45.28,1.25,1],[20.37,40.26,2.2,2],[20.77,33.97,2.5,3],[19.75,45.13,2.9,1],[19.51,27.96,3.1,3],
 [18.83,33.36,3.5,1],[18.98,32.69,3.2,1],[18.75,37.6,4.3,0],[18.9,36.9,4.3,3],[19.77,10.61,2.7,3],[19.92,6.41,3.7,2],[19.09,13.86,3.0,0],[19.42,3.11,3.4,0],[19.10,-4.88,3.4,1],[20.19,-.82,3.2,1],
 [16.49,-26.43,1.06,4],[16.01,-22.62,2.3,1],[16.09,-19.81,2.6,1],[15.98,-26.11,2.9,1],[16.35,-25.59,2.9,1],[16.60,-28.22,2.8,1],[16.84,-34.29,2.3,3],[16.86,-38.05,3.0,1],[16.91,-42.36,3.6,3],[17.20,-43.24,3.3,2],[17.62,-43.0,1.9,2],[17.79,-40.13,3.0,2],[17.71,-39.03,2.4,1],[17.56,-37.10,1.6,1],[17.51,-37.30,2.7,1],
 [18.40,-34.38,1.85,1],[18.92,-26.30,2.0,1],[19.04,-29.88,2.6,0],[18.35,-29.83,2.7,3],[18.47,-25.42,2.8,3],[18.76,-26.99,3.2,1],[19.12,-27.67,3.3,3],[18.10,-30.42,3.0,3],
 [17.58,12.56,2.1,0],[17.17,-15.72,2.4,0],[16.62,-10.57,2.6,1],[16.24,-3.69,2.7,4],[16.96,9.38,3.2,3],[17.72,4.57,2.8,3],
 [16.50,21.49,2.8,2],[16.69,31.60,2.8,2],[16.71,38.92,3.5,2],[17.25,36.81,3.2,3],[17.00,30.93,3.9,0],[17.25,24.84,3.1,0],[17.24,14.39,3.1,4],
 [15.58,26.71,2.2,0],[15.46,29.1,3.7,0],[15.71,26.3,3.8,0],[15.83,26.07,4.6,2],[15.55,31.36,4.1,1],[15.96,26.88,4.2,3],
 [14.26,19.18,-.05,3],[14.75,27.07,2.4,3],[13.91,18.40,2.7,2],[14.53,38.31,3.0,0],[15.26,33.31,3.5,2],[15.03,40.39,3.5,2],[14.53,30.37,3.6,3],
 [11.06,61.75,1.8,3],[11.03,56.38,2.4,0],[11.90,53.69,2.4,0],[12.26,57.03,3.3,0],[12.90,55.96,1.8,0],[13.40,54.93,2.2,0],[13.79,49.31,1.9,1],
 [2.53,89.26,2.0,2],[14.85,74.16,2.1,3],[15.35,71.83,3.0,0],[17.54,86.59,4.4,0],[16.77,82.04,4.2,2],[15.73,77.79,4.3,0],[16.29,75.76,5.0,0],
 [.68,56.54,2.2,3],[.15,59.15,2.3,2],[.95,60.72,2.4,1],[1.43,60.24,2.7,0],[1.91,63.67,3.4,1],
 [17.94,51.49,2.2,3],[17.51,52.30,2.8,2],[17.89,56.87,3.7,3],[17.54,55.18,4.9,0],[16.40,61.51,2.7,2],[17.15,65.71,3.2,1],[19.21,67.66,3.1,2],[14.07,64.38,3.7,0],[15.42,58.97,3.3,3],[18.35,72.73,3.6,2],
 [23.08,15.21,2.5,0],[23.06,28.08,2.4,4],[.22,15.18,2.8,1],[21.74,9.88,2.4,3],[.14,29.09,2.1,1],[1.16,35.62,2.1,4],[2.07,42.33,2.1,3],
 [3.41,49.86,1.8,2],[3.14,40.96,2.1,1],[5.28,46.0,.08,2],[6.0,44.95,1.9,0],
 [4.60,16.51,.85,4],[5.44,28.61,1.65,1],[3.79,24.1,2.9,1],[3.75,24.37,3.6,1],[3.77,24.47,3.9,1],[3.82,24.05,3.6,1],[3.76,24.11,3.9,1],[3.75,23.95,4.3,1],[3.8,24.36,5.0,1],
 [5.92,7.41,.5,4],[5.24,-8.20,.13,1],[5.42,6.35,1.6,1],[5.53,-.30,2.2,1],[5.60,-1.20,1.7,1],[5.68,-1.94,1.8,1],[5.80,-9.67,2.1,1],[5.59,9.93,3.4,1],
 [6.75,-16.72,-1.46,1],[6.98,-28.97,1.5,1],[7.14,-26.39,1.8,2],[6.38,-17.96,2.0,1],[7.40,-29.30,2.4,1],[7.66,5.22,.34,0],[7.58,31.89,1.6,0],[7.76,28.03,1.15,3],[6.63,16.40,1.9,0],
 [10.14,11.97,1.35,1],[11.82,14.57,2.1,0],[10.33,19.84,2.0,3],[11.24,20.52,2.6,0],[11.24,15.43,3.3,0],[9.76,23.77,3.0,2],[9.88,26.0,3.9,3],[10.28,23.42,3.4,0],[10.12,16.76,3.5,0],
 [13.42,-11.16,1.0,1],[12.69,-1.45,2.7,0],[13.04,10.96,2.8,2],[14.85,-16.04,2.8,0],[15.28,-9.38,2.6,1],[12.26,-17.54,2.6,1],[12.57,-23.40,2.6,2],[12.50,-16.52,2.9,0],[12.17,-22.62,3.0,3],
 [22.96,-29.62,1.16,0],[2.12,23.46,2.0,3],[1.91,20.81,2.6,0],[.73,-17.99,2.0,3],[9.46,-8.66,2.0,3]];
var STAR_COL=[[1,1,1],[.78,.86,1],[1,.95,.8],[1,.8,.58],[1,.66,.46]];
var skyStars=(function(){
  var r=mulberry32(11),N=(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches)?2600:4600,L=BRIGHT.length+N,
      ra=new Float32Array(L),dec=new Float32Array(L),mg=new Float32Array(L),tw=new Float32Array(L),cl=new Float32Array(L*3),pos=new Float32Array(L*3);
  function put(i,a,d,m,c){ra[i]=a;dec[i]=d;mg[i]=m;tw[i]=r();var C=STAR_COL[c];cl[i*3]=C[0];cl[i*3+1]=C[1];cl[i*3+2]=C[2]}
  for(var i=0;i<BRIGHT.length;i++){var B=BRIGHT[i];put(i,B[0]*Math.PI/12,B[1]*Math.PI/180,B[2],B[3])}
  for(var j=0;j<N;j++){var a,d;
    if(r()<.55){a=r()*6.2832;d=Math.asin(2*r()-1)}
    else{var gl=(r()-.5)*6.2832*(r()<.4?.35:1),gb=(r()+r()+r()-1.5)*.16,gx=Math.cos(gb)*Math.cos(gl),gy=Math.cos(gb)*Math.sin(gl),gz=Math.sin(gb);
      var ex=-0.0548755604*gx+0.4941094279*gy-0.8676661490*gz,ey=-0.8734370902*gx-0.4448296300*gy-0.1980763734*gz,ez=-0.4838350155*gx+0.7469822445*gy+0.4559837762*gz;
      a=Math.atan2(ey,ex);d=Math.asin(clamp(ez,-1,1))}
    var q=r(),c=q<.5?0:q<.72?1:q<.88?2:q<.97?3:4;put(BRIGHT.length+j,a,d,6.7-3.0*Math.pow(r(),2.2),c)}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('ra',new THREE.BufferAttribute(ra,1));g.setAttribute('dec',new THREE.BufferAttribute(dec,1));g.setAttribute('mag',new THREE.BufferAttribute(mg,1));g.setAttribute('tw',new THREE.BufferAttribute(tw,1));g.setAttribute('col',new THREE.BufferAttribute(cl,3));
  var m=new THREE.ShaderMaterial({uniforms:skyU,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:SKY_GLSL+'\nuniform float uPR;attribute float ra,dec,mag,tw;attribute vec3 col;varying vec3 vC;varying float vA;\n'+
      'void main(){float H=uLST-ra;vec3 d=cos(dec)*cos(H)*SM+cos(dec)*sin(H)*SW+sin(dec)*SP;gl_Position=projectionMatrix*viewMatrix*vec4(cameraPosition+d*900.,1.);'+
      'float ext=smoothstep(-.03,.14,d.y);float f=clamp(pow(2.512,-(mag-1.)*.42)*1.35,0.,2.);'+
      'float amp=.12+.3*(1.-smoothstep(.05,.5,d.y));float sp=1.2+fract(tw*7.3)*3.;float twk=1.-amp+amp*(.5+.5*sin(uTime*sp+tw*41.))*(.7+.3*sin(uTime*sp*.37+tw*13.));'+
      'vA=f*uNight*ext*twk;gl_PointSize=uPR*clamp(1.9+(4.4-mag)*.75,1.7,6.);vC=mix(vec3(1.),col,.85);}',
    fragmentShader:'varying vec3 vC;varying float vA;void main(){float r=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,r);a=a*a*(1.+2.*smoothstep(.18,0.,r));gl_FragColor=vec4(vC*a*vA,1.);}'});
  var p=new THREE.Points(g,m);p.frustumCulled=false;p.renderOrder=-8;scene.add(p);return p;
})();
var skyGradDome=(function(){
  var m=new THREE.ShaderMaterial({uniforms:SKYG,depthWrite:false,side:THREE.BackSide,
    vertexShader:'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*viewMatrix*vec4(cameraPosition+position,1.);}',
    fragmentShader:SKYG_GLSL+'varying vec3 vD;vec3 toSRGB(vec3 v){return mix(pow(v,vec3(0.41666))*1.055-0.055,v*12.92,vec3(lessThanEqual(v,vec3(0.0031308))));}void main(){gl_FragColor=vec4(toSRGB(skyGrad(normalize(vD))),1.);}'});
  var s=new THREE.Mesh(new THREE.SphereGeometry(980,48,32),m);s.frustumCulled=false;s.renderOrder=-10;scene.add(s);return s;
})();
var skyDome=(function(){
  var m=new THREE.ShaderMaterial({uniforms:skyU,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.BackSide,
    vertexShader:'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*viewMatrix*vec4(cameraPosition+position,1.);}',
    fragmentShader:SKY_GLSL+'\nvarying vec3 vD;'+
      'float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}'+
      'float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1.,0.,0.)),f.x),mix(h3(i+vec3(0.,1.,0.)),h3(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(h3(i+vec3(0.,0.,1.)),h3(i+vec3(1.,0.,1.)),f.x),mix(h3(i+vec3(0.,1.,1.)),h3(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}'+
      'float f3(vec3 p){return n3(p)*.5+n3(p*2.07+3.)*.25+n3(p*4.13+7.)*.15+n3(p*8.3+1.)*.1;}'+
      'void main(){vec3 d=normalize(vD);if(d.y<-.05)discard;'+
      'float dc=asin(clamp(dot(d,SP),-1.,1.)),H=atan(dot(d,SW),dot(d,SM)),ra=uLST-H;vec3 e=vec3(cos(dc)*cos(ra),cos(dc)*sin(ra),sin(dc));'+
      'vec3 g=EQ2GAL*e;float b=asin(clamp(g.z,-1.,1.)),l=atan(g.y,g.x);'+
      'float n=f3(e*3.),n2=f3(e*9.+3.),nn=f3(e*24.+9.);'+
      'float band=exp(-pow(b/(.11+.06*n),2.));'+
      'float bulge=exp(-pow(l/.42,2.)-pow(b/.19,2.));'+
      'float rift=smoothstep(.38,.78,f3(e*5.5+7.))*exp(-pow((b-.015)/(.035+.03*n2),2.))*exp(-pow((l-.55)/.95,2.));'+
      'float I=(band*(.25+.75*n*n)+bulge*1.5*(.5+.5*n2))*(1.-rift*.92)*(.45+1.1*nn*nn);'+
      'vec3 c=mix(vec3(.6,.68,.95),vec3(1.,.85,.64),clamp(bulge*1.6,0.,1.))*I;'+
      // 은하수 안의 자잘한 별 알갱이
      'vec3 q=e*430.;float hs=h3(floor(q)),fq=length(fract(q)-.5);float gr=step(.975-.03*band-.03*bulge,hs)*smoothstep(.5,.08,fq)*(.25+1.6*band+1.5*bulge)*(1.-rift*.8);'+
      'c+=vec3(.95,.95,1.)*gr*(.6+.4*sin(uTime*2.+hs*60.));'+
      'gl_FragColor=vec4(c*.34*uNight*smoothstep(-.03,.16,d.y),1.);}'});
  var s=new THREE.Mesh(new THREE.SphereGeometry(950,48,32),m);s.frustumCulled=false;s.renderOrder=-9;scene.add(s);return s;
})();
// 달: 표면 얼룩이 있는 둥근 달과 달무리. 달빛은 같은 빛(sun)을 밤에 달 쪽으로 옮겨 쓴다
var moon=(function(){var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d');x.fillStyle='#f4f1e4';x.fillRect(0,0,128,128);
  var r=mulberry32(3);for(var i=0;i<26;i++){var px=r()*128,py=r()*128,rr=6+r()*22,g=x.createRadialGradient(px,py,0,px,py,rr);g.addColorStop(0,'rgba(150,150,140,'+(.18+r()*.25)+')');g.addColorStop(1,'rgba(150,150,140,0)');x.fillStyle=g;x.fillRect(0,0,128,128)}
  var tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;
  var g=new THREE.Group(),m=new THREE.Mesh(new THREE.SphereGeometry(9,28,20),new THREE.MeshBasicMaterial({map:tex,fog:false,transparent:true}));g.add(m);
  var halo=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xcfdcff,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:false,opacity:.35}));halo.scale.setScalar(110);g.add(halo);
  g.renderOrder=-7;scene.add(g);return {g:g,m:m,halo:halo}})();
var MOON_C=col(0x9fb4ff), SUN_C=col(0xfff2dc), moonDir=new V3(), sunDirV=new V3();
var HEMI_D=col(0xeef8ff), HEMI_N=col(0x6f8fd0);
var C_DUSKSUN=col(0xffb27a), C_OVSUN=col(0xe2eaf3), C_STSUN=col(0xa9b7c6), C_OVSKY=col(0xb4c2cf);
var C_STN=new THREE.Color(0x0e141b), C_STD=new THREE.Color(0x5f6a72), C_FLASH=new THREE.Color(0xdfe6f5), tmpC2=new THREE.Color(), cLit=new THREE.Color(), cShd=new THREE.Color();
var C_NZEN=new THREE.Color(0x06143f), C_NHOR=new THREE.Color(0x2459b0), C_WHITE=new THREE.Color(0xffffff), C_HORS=new THREE.Color(), C_GLOWW=new THREE.Color(0xcfe2ff), C_DAY=new THREE.Color(0xa9dcec), C_DUSK=new THREE.Color(0xf6b48c), C_NIGHT=new THREE.Color(0x16264a), C_GREY=new THREE.Color(0xa7b4b8), skyC=new THREE.Color(), fogC=new THREE.Color();

// 바다: 물결 모양, 부서지는 파도, 거품, 물빛을 모두 셰이더에서 계산한다. 섬의 윤곽과 해변 기울기를 식으로 알고 있어 물가가 픽셀 단위로 그려진다
var water, waterFar, waterU;
(function(){
  var common=[
  'uniform float uTime,uSea,uR,uCalm,uFlat,uBig,uWind,uWindA,uStorm,uRain,uOver;uniform vec4 uAmp,uPh;',
  // 바람이 미는 쪽 해변일수록 파도가 크다
  'float dirW(float th){return 0.35+0.65*pow(0.5+0.5*cos(th-uWindA),1.5);}',
  'const float TAU=6.2831853;',
  'float radiusAt(float th){return uR*(1.+uAmp.x*sin(2.*th+uPh.x)+uAmp.y*sin(3.*th+uPh.y)+uAmp.z*sin(4.*th+uPh.z)+uAmp.w*sin(5.*th+uPh.w));}',
  // 해안을 따라 파도가 닿는 때가 엇갈린다: 섬을 크게 도는 굽이 + 20m쯤마다 앞서고 늦는 짧은 굽이
  'float shoreOff(float th){return 0.35*sin(th*2.+1.)+0.2*sin(th*5.)+0.12*sin(th*11.+2.3)+0.07*sin(th*19.+.7);}',
  // 파도마다 크기가 달라 큰 물과 작은 물이 번갈아 밀려온다(0.55~1.35배). 오차를 키우는 해시 대신 부드러운 사인 수열을 써서 GPU(32비트)와 JS(64비트)가 같은 값을 낸다
  'float swashU(float th){float x=uTime/5.5+shoreOff(th)+9.75,ph=fract(x),n=floor(x),k=.95+.4*(sin(n*2.3999+1.3)*.6+sin(n*.7071)*.4);return k*(ph<0.32?sin(ph/0.32*1.5708):pow(max(cos((ph-0.32)/0.68*1.5708),0.),1.6));}',
  // 해변을 타고 오르는 물의 높이. 해변 기울기가 0.09쯤이라 높이 0.2면 2m쯤 밀려 올라온다. 아무리 커도 높이 0.6(모래사장 중턱)을 넘지 않는다
  'float swashH(float th){return min(0.6-uSea,0.03+(0.17+0.05*sin(th*7.+2.))*(1.+(uWind*0.3+uBig*0.9)*dirW(th))*swashU(th)*uCalm);}',
  // 물 높이: 물때 + 해변을 타고 오르는 물 + 물가로 밀려오며 솟는 파도 + 먼바다 너울
  'float waterY(vec2 p,out float crest,out float sd){',
  '  float d=length(p),th=atan(p.y,p.x),rr=radiusAt(th);',
  '  sd=d-rr*(1.-uSea*0.2444);',
  '  float S=swashH(th)*(1.-smoothstep(0.,7.,sd));',
  '  float ph=0.5712*sd+TAU*(uTime/5.5+shoreOff(th));',
  '  crest=pow(0.5+0.5*sin(ph+0.45*cos(ph)),2.6);',
  '  float env=0.4*(1.+(uWind*0.5+uBig*1.7)*dirW(th))*smoothstep(32.,9.,sd)*smoothstep(0.5,5.,sd);',
  '  float deep=smoothstep(3.,18.,sd)*(1.+uStorm*1.7);',
  '  float sw=0.20*sin(dot(p,vec2(.085,.04))+uTime*.8)+0.14*sin(dot(p,vec2(-.03,.11))+uTime*.65)+0.07*sin(dot(p,vec2(.21,.17))+uTime*1.3)+0.04*sin(dot(p,vec2(-.31,.27))+uTime*1.9);',
  '  float edge=1.-smoothstep(118.,158.,max(abs(p.x),abs(p.y)));',
  '  return uSea+S+(env*crest+sw*deep)*uCalm*edge;',
  '}'].join('\n');
  var vs=common+[
  'varying vec3 vW;varying vec3 vN;varying float vCrest;',
  'void main(){vec3 p=position;float c=0.,sd,c2,s2;',
  '  if(uFlat<0.5){float e=0.7,h=waterY(p.xz,c,sd),hx=waterY(p.xz+vec2(e,0.),c2,s2),hz=waterY(p.xz+vec2(0.,e),c2,s2);p.y=h;vN=normalize(vec3(h-hx,e,h-hz));}',
  '  else{p.y=uSea-0.6;vN=vec3(0.,1.,0.);}',
  '  vCrest=c;vW=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}'].join('\n');
  var fs=common+SKYG_GLSL+BUB_GLSL+[
  'uniform vec3 uSunDir,uSunCol,uSky,uFog,uFireP,uMoonDir;uniform float uLight,uFireI,uMoonI,uPx;uniform vec4 uRocks[32];uniform vec4 uSplash;uniform vec4 uFoot[6];',
  'varying vec3 vW;varying vec3 vN;varying float vCrest;',
  'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
  'float fbm(vec2 p){return vnoise(p)*.55+vnoise(p*2.13+7.)*.3+vnoise(p*4.31+3.)*.15;}',
  // 셀 경계까지의 거리: 물막 위 거품이 그물처럼 이어진 무늬를 만든다
  // 반짝임 길: 거칠기가 거리에 따라 넓어지는 GGX 반사를 무릎(x/(x+k)*M)으로 눌러, 가운데는 하얗게 터지고 가장자리는 은은하게 남는다
  // 프레넬은 누른 뒤에 곱한다. 멀수록 한 픽셀이 더 넓은 바다를 담으므로 거칠기를 키워 길이 수평선 쪽으로 넓어진다
  'float glint(vec3 N,vec3 V,vec3 L,float dist){if(L.y<=0.)return 0.;vec3 H=normalize(L+V);float nh=max(dot(N,H),0.),vh=max(dot(V,H),0.);',
  '  float r=mix(.12,.34,smoothstep(15.,900.,dist)),a=r*r+.035*smoothstep(0.,1500.,dist),a2=a*a,dd=nh*nh*(a2-1.)+1.,D=a2/(3.14159*dd*dd);',
  '  return D/(D+3.)*4.*(.02+.98*pow(1.-vh,5.));}',
  'float cellE(vec2 q){vec2 i=floor(q),f=fract(q);float d1=8.,d2=8.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y)),o=vec2(hash(i+g),hash(i+g+19.7));o=.5+.42*sin(uTime*.5+6.2831*o);vec2 r=g+o-f;float dd=dot(r,r);if(dd<d1){d2=d1;d1=dd;}else if(dd<d2)d2=dd;}return sqrt(d2)-sqrt(d1);}',
  // 잔물결: 두 겹을 서로 다른 각도로 돌려 격자 결이 겹쳐 보이지 않게 한다
  'float ripple(vec2 p){return vnoise(mat2(.8,-.6,.6,.8)*p*1.1+uTime*vec2(.35,.22))+0.5*vnoise(mat2(.34,.94,-.94,.34)*p*2.7-uTime*vec2(.3,.41));}',
  'vec3 toSRGB(vec3 v){return mix(pow(v,vec3(0.41666))*1.055-0.055,v*12.92,vec3(lessThanEqual(v,vec3(0.0031308))));}',
  'void main(){',
  '  vec2 p=vW.xz;float d=length(p),th=atan(p.y,p.x),rr=radiusAt(th),t=1.-d/rr;',
  '  float bed=t>-0.12?t*4.0909:-0.4909+(t+0.12)*9.;',
  '  float depth=uFlat>0.5?6.:vW.y-bed;',
  '  if(depth<0.)discard;',
  '  float sd=d-rr*(1.-uSea*0.2444);',
  // 잔물결로 법선을 흔들어 햇빛이 잘게 반짝이게 한다
  // 넓게 휘어 놓은 자리에서 잔물결을 읽어 무늬가 줄지어 반복되지 않게 하고, 바람에 실려 가는 얼룩(수십 m)으로 거친 곳과 매끈한 곳을 나눈다.
  // 바람이 셀수록 거친 곳이 넓어진다. 멀어질수록 잔물결을 줄여 한 픽셀 안에서 무늬가 뭉개져 바둑판처럼 보이지 않게 한다
  '  vec2 wdA=vec2(cos(uWindA),sin(uWindA)),pw=p+(vec2(vnoise(p*.09+uTime*.02),vnoise(p*.09+7.3-uTime*.017))-.5)*3.4;',
  '  float cat=smoothstep(.3,.72,fbm(mat2(.6,-.8,.8,.6)*(p-wdA*uTime*1.4)*.021)+.12*uWind+.25*uStorm),patchK=mix(.3,1.3,cat);',
  '  float e=0.35,r0=ripple(pw),rx=ripple(pw+vec2(e,0.)),rz=ripple(pw+vec2(0.,e)),rs=0.55*smoothstep(0.02,0.7,depth)*patchK*mix(1.,.4,smoothstep(35.,150.,distance(cameraPosition,vW)));',
  // 해변 바위: 밀려든 물이 바위를 감싸며 갈라지고, 둘레로 잔물결과 거품이 인다
  '  vec2 rkN=vec2(0.);float rkF=0.;',
  // 암초(w가 꼭대기 높이): 잠긴 바위 위는 물이 그만큼 얕아 옥색으로 밝아지고, 꼭대기가 깊을수록 둘레 물결과 거품이 약해진다
  '  for(int i=0;i<32;i++){vec4 RK=uRocks[i];if(RK.z<=0.)continue;vec2 dv=p-RK.xy;float dl=length(dv);float dr=dl-RK.z;',
  '    float rkS=RK.w<-50.?1.:1.-smoothstep(0.,.75,uSea-RK.w);',
  '    if(RK.w>-50.&&dl<RK.z*1.15){float lt=RK.w-pow(dl/RK.z,2.)*RK.z*.75;depth=min(depth,max(vW.y-lt,.003));}',
  '    if(dr<3.5&&rkS>.01){float fall=exp(-max(dr,0.)*1.3)*rkS;rkN+=dv/max(dl,.001)*sin(dr*8.-uTime*4.5)*fall*.3;',
  '      float sw2=vnoise(vec2(atan(dv.y,dv.x)*2.5+uTime*.5,dr*2.6-uTime*1.6));',
  '      rkF=max(rkF,(1.-smoothstep(0.,.18+.5*sw2,dr+(1.-rkS)*.6))*(.5+.5*sw2)*rkS);}}',
  // 고래가 떨어진 자리: 퍼져 나가는 물결 고리와 하얗게 부서진 물
  '  vec2 sv=p-uSplash.xy;float sdd=length(sv);float sRing=exp(-pow((sdd-uSplash.z)/(.7+uSplash.z*.12),2.))*uSplash.w,sIn=(1.-smoothstep(0.,uSplash.z*.8+1.,sdd))*uSplash.w;',
  '  rkF=max(rkF,max(sRing*.9,sIn));rkN+=sv/max(sdd,.01)*sin(sdd*2.2-uTime*6.)*uSplash.w*exp(-abs(sdd-uSplash.z)*.3)*.35;',
  // 빗방울이 떨어진 자리마다 작은 동심원이 퍼진다
  '  vec2 rpn=vec2(0.);for(int k=0;k<2;k++){vec2 c=p*(1.7+float(k)*1.1)+float(k)*7.3;vec2 ci=floor(c);vec2 cf=fract(c)-.5;float hh=hash(ci+float(k)*3.1);float tt=fract(uTime*(.9+hh*.7)+hh*10.);vec2 o=vec2(hash(ci+3.7),hash(ci+5.3))-.5;vec2 dd=cf-o*.5;float dl=length(dd);float rg=sin((dl-tt*.45)*42.)*smoothstep(.07,0.,abs(dl-tt*.45))*(1.-tt)*step(hh,uRain*.95);rpn+=dd/max(dl,.001)*rg;}',
  // 물속을 걸을 때: 발이 닿은 자리마다 작은 물결 고리가 퍼진다
  '  for(int i=0;i<6;i++){vec4 F=uFoot[i];vec2 fv=p-F.xy;float fd=length(fv);float fr=F.z*1.15+.12;float fw=F.w*(1.-smoothstep(.5,1.5,F.z));if(fw>0.&&fd<fr+.7){float rg=exp(-pow((fd-fr)/(.07+F.z*.06),2.))*fw;rkN+=fv/max(fd,.01)*rg*.7;rkF=max(rkF,rg*.5*(1.-smoothstep(0.,1.,F.z)));}}',
  // 먼바다(평평한 판): 너울의 기울기를 법선에 넣어 멀리까지 물결 줄이 일렁인다
  '  vec3 vNf=vN;if(uFlat>0.5){vec2 q=p;float t1=uTime;vec2 gs=.2*cos(dot(q,vec2(.085,.04))+t1*.8)*vec2(.085,.04)+.14*cos(dot(q,vec2(-.03,.11))+t1*.65)*vec2(-.03,.11)+.07*cos(dot(q,vec2(.21,.17))+t1*1.3)*vec2(.21,.17)+.04*cos(dot(q,vec2(-.31,.27))+t1*1.9)*vec2(-.31,.27)'+
  '+.05*cos(dot(q,vec2(.5,.33))+t1*2.1)*vec2(.5,.33)+.04*cos(dot(q,vec2(-.41,.6))+t1*2.6)*vec2(-.41,.6);vNf=normalize(vec3(-gs.x*2.2,1.,-gs.y*2.2));}',
  '  vec3 N=normalize(vNf+vec3(r0-rx,0.,r0-rz)*rs*(1.+uStorm*.8)+vec3(rkN.x,0.,rkN.y)*smoothstep(0.,.12,depth)+vec3(rpn.x,0.,rpn.y)*.3*(1.-smoothstep(12.,40.,distance(cameraPosition,vW))));',
  '  vec3 V=normalize(cameraPosition-vW);float dist=distance(cameraPosition,vW);',
  // 물색: 깊이에 따라 맑은 옥색 → 청록 → 파랑 → 짙은 파랑, 아주 깊으면 남색 (#8FF3E4 → #1BBFC6 → #1690C8 → #0D5FA0, 선형 색)
  '  vec3 base=mix(vec3(.275,.896,.776),vec3(.011,.521,.565),smoothstep(0.,.35,depth));base=mix(base,vec3(.008,.279,.578),smoothstep(.5,1.2,depth));',
  '  base=mix(base,vec3(.004,.115,.351),smoothstep(1.2,2.2,depth));base=mix(base,vec3(.006,.07,.2),smoothstep(3.,8.,depth));',
  'base*=1.-.32*uOver;base=mix(base,vec3(.012,.07,.3),(1.-uLight)*.45);',
  '  float ndl=max(dot(N,uSunDir),0.);',
  '  vec3 col=base*(0.3+0.7*uLight)*(0.72+0.38*ndl);',
  // 빛 흡수: 빨강이 가장 빨리, 파랑이 가장 늦게 줄어든다(1m에 2.5/1/0.65). 얕은 물 아래 모래는 붉은 기가 빠져 맑은 옥색으로 비친다
  // 섞기는 투명도 하나로만 되므로, 아래 모래(대략의 색)가 채널마다 덜 비쳐야 할 만큼을 물 색에서 미리 뺀다. 얇은 물에도 몸 색 18%는 남긴다
  '  float nv=max(dot(N,V),0.);vec3 trans=exp(-vec3(2.5,1.,.65)*depth/max(nv,.35));',
  '  float alpha=max(dot(1.-trans,vec3(.3,.4,.3)),.18*smoothstep(0.,.03,depth));alpha=max(alpha,smoothstep(1.,3.,depth));if(uFlat>0.5)alpha=1.;',
  '  col=max(col-vec3(.85,.72,.45)*(0.3+0.7*uLight)*((1.-alpha)-trans)*.8/max(alpha,.05),0.);',
  '  float F=0.03+0.97*pow(1.-max(dot(N,V),0.),5.);',
  '  vec3 Rf=reflect(-V,N);Rf.y=abs(Rf.y);col=mix(col,skyGrad(Rf)*1.05,F*0.75);',
  '  col+=uSunCol*glint(N,V,uSunDir,dist);',
  // 달빛: 잔물결마다 반짝이며 달 쪽으로 길게 이어지는 빛길
  '  col+=vec3(.78,.85,1.)*uMoonI*glint(N,V,uMoonDir,dist)*1.15;',
  // 역광에 비치는 파도 마루: 물가로 밀려오며 솟은 마루는 얇아서, 해를 마주 보면 햇빛이 뚫고 나와 청록빛으로 비친다. 비스듬히 볼수록 두께를 길게 지나 더 빛난다
  '  if(uFlat<0.5&&sd<32.){float cH=vCrest*.4*(1.+(uWind*.5+uBig*1.7)*dirW(th))*smoothstep(32.,9.,sd)*smoothstep(.5,5.,sd)*uCalm;',
  '    float ctr=smoothstep(.08,.45,cH)*pow(1.-nv,1.35)*(.24+.76*pow(max(dot(-V,uSunDir),0.),2.4))*smoothstep(0.,.15,uSunDir.y)*uLight*(1.-uOver*.8);',
  '    col+=vec3(.008,.2,.19)*ctr;}',
  // 거품: 물가의 흰 가장자리, 얕은 곳의 레이스 무늬, 부서지는 마루와 그 뒤에 남는 자국
  '  float lace=fbm(p*0.9+vec2(uTime*0.05,-uTime*0.04)+N.xz*1.4)*0.62+fbm(p*2.7-vec2(uTime*0.08))*0.38;',
  '  float bigL=(uWind*0.4+uBig)*dirW(th);',
  '  float edgeF=(1.-smoothstep(0.004,0.03,depth))*0.3;',
  '  float shal=(1.-smoothstep(0.06,0.6,depth))*(0.17+0.12*bigL);',
  // 폭풍이 불면 먼바다의 물마루마다 흰 파도가 부서진다
  '  float wcap=uStorm*smoothstep(.15,.55,(vW.y-uSea)/(.3+.5*uStorm))*smoothstep(4.,12.,sd);',
  '  float amt=uFlat>0.5?0.:max(max(edgeF,shal),max(rkF*.8,wcap*.75));',
  '  float thr=0.97-amt*0.9;float foam=smoothstep(thr,thr+0.26,lace);',
  '  col=mix(col,mix(col,vec3(.88,.94,.92)*(0.4+0.6*uLight),0.85),foam*0.78);',
  '  alpha=max(alpha,foam*0.45*smoothstep(0.,0.07,depth));',
  // 부서진 파도 줄: 파장(11m)마다 하나씩 물가로 밀려온다. 물가 쪽 앞선은 날카로운 흰 줄, 그 뒤로 레이스 거품이 끌린다
  // 줄마다 크게 굽이지고(mea), 군데군데만 부서지며(seg), 물가 1.5m 안에서는 물막 거품에 자리를 넘긴다
  '  if(uFlat<0.5&&sd<26.){',
  '    float mea=(vnoise(p*.05+vec2(uTime*.015,0.))-.5)*.4+(vnoise(p*.22+vec2(0.,uTime*.05))-.5)*.07;',
  '    float wp=(0.5712*sd)/TAU+uTime/5.5+shoreOff(th)+mea-.3;float u=fract(wp),wi=floor(wp);',
  '    float seg=smoothstep(.22,.5,vnoise(p*.06+vec2(wi*3.7,wi*1.3))+.25*min(bigL,1.));',
  '    float zoneB=smoothstep(24.,13.,sd)*smoothstep(.3,1.8,sd)*seg;',
  '    float fw=.035+.04*vnoise(p*1.8+wi);float lineF=1.-smoothstep(fw*.45,fw,u);',
  '    float rl=1.-abs(fbm(p*1.9+vec2(uTime*.03,0.)+wi*3.1)*2.-1.),bb=vnoise(p*7.+wi*5.);float tr=(1.-smoothstep(fw,.55,u))*max(smoothstep(.8,.94,rl+.12*(1.-u)),smoothstep(.7,.84,bb)*(1.-u)*.75);',
  '    float boreA=zoneB*max(lineF*smoothstep(.15,.4,vnoise(p*3.+wi)+.2),tr*.8);',
  // 거품은 기포 점으로 그리고, 부서진 물은 하얗게가 아니라 연한 청록으로 밝힌다
  '    float boreF=bubbles(p+vec2(wi*1.7,wi*.9),boreA,dist/uPx),aer=zoneB*(1.-smoothstep(fw,.6,u))*(1.-boreF);',
  '    col=mix(col,vec3(.6,.95,.92)*(0.35+0.65*uLight),aer*.3);',
  '    col=mix(col,vec3(.93,.96,.95)*(0.45+0.55*uLight),boreF*.9);alpha=max(alpha,boreF*.9);}',
  // 해변을 타고 오르는 물막: 맨 앞에 하얀 거품 띠가 서고, 그 뒤로 그물 같은 거품 무늬가 물과 함께 밀려왔다 빠진다
  // ed는 물가까지의 수평 거리(m). 해변 기울기가 4.09/rr라 물 깊이를 거리로 바꿀 수 있다
  '  float ed=depth*rr/4.0909;',
  '  if(uFlat<0.5&&ed<5.){',
  '    float sph=fract(uTime/5.5+shoreOff(th)+9.75),upK=sph<0.32?1.:1.-.75*smoothstep(.32,.75,sph);',
  '    float bub=vnoise(p*13.+uTime*.4),wob=(vnoise(p*.8+vec2(0.,uTime*.2))-.3)*.45+(vnoise(p*3.1-uTime*.3)-.5)*.14+(bub-.5)*.05;',
  // 맨 앞 거품 띠: 물가가 울퉁불퉁하고, 밀려올 때 두껍고 빠질 때 가늘어지며 군데군데 끊긴다
  '    float e2=ed-max(wob,0.),front=smoothstep(0.,.025,e2);',
  '    float rw=(.2+.3*vnoise(p*.9+vec2(uTime*.15,3.)))*(.45+.55*upK);',
  '    float rim=front*(1.-smoothstep(rw*.55,rw+.05,e2+(bub-.5)*.14))*smoothstep(.05,.3,vnoise(p*.7+vec2(uTime*.1,0.))+.3*upK);',
  // 그 뒤의 그물 무늬: 해변을 따라 길쭉한 셀, 굵기가 들쭉날쭉하고 군데군데 끊기며 물과 함께 오르내린다
  '    vec2 nr=p/max(d,.001),tg=vec2(-nr.y,nr.x);float shz=(0.03+0.17*swashU(th))*rr/4.0909;',
  '    vec2 pp=p-nr*shz*.85;vec2 lq=vec2(dot(pp,tg)*1.1,dot(pp,nr)*1.9)+vec2(fbm(p*1.1),fbm(p*1.1+5.2))*1.6;',
  '    float lw=.02+.08*vnoise(lq*.9+11.)*(1.-smoothstep(.3,2.,e2)*.6);float web=(1.-smoothstep(lw,lw+.05,cellE(lq)))*smoothstep(.22,.5,vnoise(lq*1.3+uTime*.05));',
  '    web=max(web*(.6+.4*bub),smoothstep(.78,.86,bub)*.7*smoothstep(.2,.5,vnoise(lq*.7)));',
  '    float zone=front*smoothstep(rw*.5,rw+.3,e2)*(1.-smoothstep(.9,2.4+1.4*upK,ed))*smoothstep(.2,.6,vnoise(p*.45+uTime*.03)+.25*upK);',
  '    float amtS=max(rim,web*zone*.8);alpha*=front;',
  // 물가선: 화면에서 2.5픽셀 굵기로 또렷하게, 멀어져 픽셀이 커지면 끈다. 거품은 물과 함께 오르내리는 기포 점
  '    float fp=dist/uPx,lwW=2.5*fp/max(V.y,.12),wln=front*(1.-smoothstep(lwW*.6,lwW,e2))*(1.-smoothstep(.05,.12,fp));',
  '    float shoreF=max(bubbles(pp,amtS,fp),wln*.95);',
  '    col=mix(col,vec3(.6,.95,.92)*(0.35+0.65*uLight),zone*.25*(1.-shoreF));',
  '    col=mix(col,vec3(.93,.96,.95)*(0.45+0.55*uLight),shoreF*.95);alpha=max(alpha,shoreF*.95*smoothstep(0.,.003,depth));}',
  '  float rkW=uFlat>0.5?0.:rkF*smoothstep(.42,.6,lace+.28*rkF);col=mix(col,vec3(.9,.95,.93)*(0.4+0.6*uLight),rkW*.7);alpha=max(alpha,rkW*.65);if(uFlat>0.5)alpha=1.;',
  // 모닥불 빛이 물에 번지고 잔물결에 길게 비친다
  '  vec3 Lf=uFireP-vW;float df=length(Lf);Lf/=df;float fat=uFireI*pow(max(1.-df/34.,0.),2.);',
  '  col+=vec3(1.,.69,.25)*fat*(0.22*max(dot(N,Lf),0.)+pow(max(dot(N,normalize(Lf+V)),0.),50.)*1.6);',
  // 멀리 반짝이는 물비늘: 잔물결 낱낱이 수평선 빛과 달빛을 받아 깜빡인다
  '  {vec2 gq=p*.45;vec2 gi=floor(gq);float gh=hash(gi);vec2 go=fract(gq)-.5-(vec2(hash(gi+3.1),hash(gi+7.7))-.5)*.7;float tw=.5+.5*sin(uTime*(1.2+gh*3.)+gh*40.);',
  '   float gl=step(.72,gh)*smoothstep(.16,0.,length(go))*tw*tw*smoothstep(15.,90.,dist)*(1.-uRain*.6)*(1.-uOver*.7);',
  '   col+=(uGlow*1.8+vec3(.75,.85,1.)*uMoonI*.5)*gl;}',
  // 수평선: 반짝임과 거품을 다 더한 뒤 마지막에, 수평선 바로 위 하늘빛보다 7% 어두운 색으로 덮는다
  // 바다가 하늘보다 밝아지지 않아 수평선이 번진 띠가 아니라 깔끔한 단차로 선다. 가까운 바다는 제 색을 지킨다
  '  float hzd=max(dist-200.,0.)/900.;col=mix(col,(uHor+uGlow*.6)*.93,1.-exp(-hzd*hzd*3.));',
  '  gl_FragColor=vec4(toSRGB(col),alpha);}'].join('\n');
  waterU={uPx:PXU,uZen:SKYG.uZen,uHor:SKYG.uHor,uGlow:SKYG.uGlow,uFoot:{value:[0,1,2,3,4,5].map(function(){return new THREE.Vector4(9999,9999,9,0)})},uStorm:{value:0},uRain:{value:0},uOver:{value:0},uSplash:{value:new THREE.Vector4(0,0,0,0)},uMoonDir:{value:new V3(0,1,0)},uMoonI:{value:0},uRocks:{value:Array.from({length:32},function(){return new THREE.Vector4(9999,9999,0,-99)})},uFireP:{value:new V3()},uFireI:{value:0},uBig:{value:0},uWind:{value:0},uWindA:{value:0},uTime:{value:0},uSea:{value:0},uR:{value:40},uCalm:{value:1},uFlat:{value:0},uAmp:{value:new THREE.Vector4()},uPh:{value:new THREE.Vector4()},
    uSunDir:{value:new V3(0,1,0)},uSunCol:{value:new THREE.Color(1,1,1)},uSky:{value:new THREE.Color()},uFog:{value:new THREE.Color()},uLight:{value:1}};
  var g=new THREE.PlaneGeometry(320,320,255,255); g.rotateX(-Math.PI/2);
  water=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:waterU,vertexShader:vs,fragmentShader:fs,transparent:true}));
  water.frustumCulled=false; water.renderOrder=3; scene.add(water);
  // 먼바다 판은 가까운 물 영역 바깥에만 둔다. 섬 둘레까지 덮으면 얕은 바닥이 이 판에 가려져 물가에서 바다가 갑자기 깊어 보인다
  var gf=new THREE.RingGeometry(140,1600,96,1); gf.rotateX(-Math.PI/2);
  var uf={}; for(var k in waterU)uf[k]=waterU[k]; uf.uFlat={value:1};
  waterFar=new THREE.Mesh(gf,new THREE.ShaderMaterial({uniforms:uf,vertexShader:vs,fragmentShader:fs}));
  waterFar.frustumCulled=false; scene.add(waterFar);
})();

// 구름
/* ---------- 날씨: 맑음, 흐림, 이슬비, 비, 소나기, 폭풍우 ---------- */
var WX_KIND={clear:{name:'맑음',cover:.34,dark:0,rain:0,wind:.18,storm:0,dur:[90,160]},cloudy:{name:'흐림',cover:.72,dark:.28,rain:0,wind:.35,storm:0,dur:[70,130]},
  drizzle:{name:'이슬비',cover:.86,dark:.36,rain:.18,wind:.28,storm:0,dur:[60,110]},rain:{name:'비',cover:.95,dark:.52,rain:.55,wind:.48,storm:.15,dur:[60,110]},
  shower:{name:'소나기',cover:.9,dark:.58,rain:.9,wind:.55,storm:.25,dur:[28,45]},storm:{name:'폭풍우',cover:1,dark:.82,rain:1,wind:1,storm:1,dur:[60,100]}};
var WX_ORDER=['clear','cloudy','drizzle','rain','shower','storm'];
var WX={kind:'clear',cover:.34,dark:0,rain:0,wind:.18,storm:0,next:70,flash:0,boltT:0,nextBolt:0,gust:0};
// 날씨는 섬 시드와 실제 시각으로 정해진다(env.js). '날씨' 버튼으로 바꾸면 10분 동안 그대로 둔다
var windDirU={value:new THREE.Vector2(1,0)},windStrU={value:.2},windGP={value:0},windFP={value:0};
// 돌풍 무늬: 바람 방향으로 흘러가는 얼룩. GPU와 JS가 같은 값을 내도록 해시 노이즈 대신 사인 조합을 쓴다(바람 줄기가 돌풍을 탄다)
// 흐르는 위치(windGP)와 잔떨림 위상(windFP)은 매 프레임 바람 세기만큼 쌓아서, 날씨가 바뀌며 세기가 변해도 무늬가 튀지 않는다
var WGUST_GLSL='float wGust(vec2 q){return .5+.17*sin(1.9*q.x+1.3*sin(1.1*q.y+.7))+.12*sin(3.7*q.x-2.3*q.y+1.9)+.08*sin(5.3*q.x+4.1*q.y+3.3*sin(.6*q.x));}';
function windGustAt(x,z){var d=windDirU.value,qx=(x*d.x+z*d.y-windGP.value)*.06,qy=(-x*d.y+z*d.x)*.03;
  return smoothstep(.2,.9,.5+.17*Math.sin(1.9*qx+1.3*Math.sin(1.1*qy+.7))+.12*Math.sin(3.7*qx-2.3*qy+1.9)+.08*Math.sin(5.3*qx+4.1*qy+3.3*Math.sin(.6*qx)))}
// 바람에 흔들림: 풀, 덤불 잎, 야자 잎과 줄기를 세계 좌표에서 바람 방향으로 휘게 하고, 돌풍과 잔떨림을 더한다
// 휘는 정도(BEND), 바람 세기 배율(K), 옆떨림(FLUT), 휘는 것의 키(H: 길이를 지키며 휘도록 이만큼 내려앉는다)
// 풀은 강풍이면 키의 80%까지 눕고, 덤불은 덩어리째 밀리며 잎끝이 날린다. 야자 잎은 아래에서 따로 꺾는다
var WIND_BEND={grass:'pow(max(position.y,0.)/.55,2.)*.5',flower:'pow(max(position.y,0.)/.55,2.)*.45',trunk:'pow(max(position.y,0.)/7.,2.)*.6',frond:'.6*pow(aTH/7.,2.)',leaf:'(.1+max(position.z,0.)*.6)',core:'.1'};
var WIND_K={grass:'1.',flower:'1.',trunk:'1.',frond:'1.',leaf:'1.',core:'1.'};
var WIND_FLUT={grass:'.1',flower:'.07',trunk:'.0',frond:'.09*max(position.z,0.)/4.4',leaf:'.08',core:'.0'};
var WIND_H={grass:'max(position.y,.05)',flower:'max(position.y,.05)',trunk:'max(position.y,.05)',frond:'aTH',leaf:'.36',core:'1.'};
// 야자 잎: 줄기 꼭대기(잎 밑동)를 축으로 잎 전체를 바람 쪽으로 꺾는다. 바람을 등진 잎은 들려 넘어가고, 옆을 향한 잎은 바람 쪽으로 쓸리며,
// 바람을 따라 놓인 잎은 늘어진다. 밑동은 거의 그대로, 끝으로 갈수록 더 꺾여 활처럼 휜다. 돌풍이 지나가면 크게 출렁인다
var FROND_WIND=['#ifdef USE_INSTANCING',
  'vec3 fb=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz,fd=normalize((modelMatrix*instanceMatrix*vec4(0.,0.,1.,0.)).xyz);',
  'float kb=clamp(ws*(.38+.5*gust)+.1*gust*sin(uFP*1.3+fb.x*.7+fb.z*.5)+.05*(.3+ws)*sin(uFP*1.9+fd.x*5.+fd.z*3.),0.,.85);',
  'vec2 fh=fd.xz/max(length(fd.xz),.001);',
  'float fu=dot(fh,uWD);vec3 fd2=normalize(fd+vec3(uWD.x,1.5*max(0.,-fu)-.5*max(0.,fu)-.1,uWD.y)*kb);',
  'vec3 fax=cross(fd,fd2);float fsl=length(fax);',
  'if(fsl>1e-4){fax/=fsl;float fth=acos(clamp(dot(fd,fd2),-1.,1.))*smoothstep(-.4,4.4,max(position.z,0.));',
  '  vec3 fr=wp4.xyz-fb;fr=fr*cos(fth)+cross(fax,fr)*sin(fth)+fax*dot(fax,fr)*(1.-cos(fth));wp4.xyz=fb+fr;}',
  '#endif'].join('\n');
// 풀·꽃: 밀어내는 거리 대신 눕는 각도로 휜다. 포기 크기를 반영한 실제 키를 기준으로 밑동은 조금, 끝으로 갈수록 많이 꺾이고(길이 유지),
// 강풍이면 20~65°까지 눕고 돌풍이 지나갈 때마다 출렁인다
var GRASS_WIND=['float gyl=max(position.y,0.),gsc=1.;','#ifdef USE_INSTANCING','gsc=length(instanceMatrix[1].xyz);','#endif',
  'float gth=clamp(ws*(.35+.8*sway),0.,1.15)+.16*ws*gust*sin(uFP*1.7+wal*.9+wac*.5)+.04*sin(uFP*1.1+wal*2.3+wac*1.7)*(.3+ws);',
  'float gbp=gth*min(gyl/.5,1.25),gyw=gyl*gsc;',
  'vec2 wdisp=uWD*gyw*sin(gbp)+wpp*flut*FLUTK*(.1+ws*.6);float wdrop=gyw*(1.-cos(gbp));'].join('\n');
function windify(m,kind){var prev=m.onBeforeCompile,pk=m.customProgramCacheKey;
  m.onBeforeCompile=function(sh,r){if(prev)prev(sh,r);sh.uniforms.uWT2=windU;sh.uniforms.uWD=windDirU;sh.uniforms.uWS=windStrU;sh.uniforms.uGP=windGP;sh.uniforms.uFP=windFP;
    sh.vertexShader='uniform float uWT2,uWS,uGP,uFP;uniform vec2 uWD;\n'+WGUST_GLSL+'\n'+sh.vertexShader.replace('#include <project_vertex>',[
      'vec4 wp4=vec4(transformed,1.);','#ifdef USE_INSTANCING','wp4=instanceMatrix*wp4;','#endif','wp4=modelMatrix*wp4;',
      'float ws=uWS*'+WIND_K[kind]+';vec2 wpp=vec2(-uWD.y,uWD.x);float wal=dot(wp4.xz,uWD),wac=dot(wp4.xz,wpp);',
      'float gust=smoothstep(.2,.9,wGust(vec2((wal-uGP)*.06,wac*.03)));',
      'float sway=gust+.08*sin(uWT2*1.2-wal*.3)*gust;',
      'float flut=sin(uFP+wal*1.2+position.z*2.+position.y*2.5)*gust;',
      kind==='frond'?FROND_WIND:'',
      (kind==='grass'||kind==='flower')?GRASS_WIND.split('FLUTK').join('('+WIND_FLUT[kind]+')'):
      // 길이를 지키며 휜다: 키 H인 것이 옆으로 d만큼 밀리면 H-sqrt(H²-d²)만큼 내려앉는다. 키의 85%보다 더 밀리지는 않는다
      'vec2 wdisp=uWD*('+WIND_BEND[kind]+')*(ws*(.25+.9*sway)+.025)+wpp*flut*('+WIND_FLUT[kind]+')*(.1+ws*.6);float wH='+WIND_H[kind]+',wdl=length(wdisp);if(wdl>wH*.85)wdisp*=wH*.85/wdl;wdl=min(wdl,wH*.85);float wdrop=wH-sqrt(wH*wH-wdl*wdl);',
      'wp4.xz+=wdisp;wp4.y-=wdrop;',
      'vec4 mvPosition=viewMatrix*wp4;gl_Position=projectionMatrix*mvPosition;'].join('\n'))};
  m.customProgramCacheKey=function(){return 'wind-'+kind+(pk?pk.call(m):'')};return m}
// 윤곽선: 사람, 동물, 줄기, 바위 둘레에 짙은 선을 둘러 그림처럼 보이게 한다
var OUT_MATS={};
function outlineMat(w){if(OUT_MATS[w])return OUT_MATS[w];var m=new THREE.MeshBasicMaterial({color:col(0x2e2420),side:THREE.BackSide});
  m.onBeforeCompile=function(sh){sh.uniforms.uOW={value:w};sh.vertexShader='uniform float uOW;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=normalize(normal)*uOW;')};
  return OUT_MATS[w]=m}
function addOutline(root,w){var list=[];root.traverse(function(o){if(o.isMesh&&!o.isInstancedMesh&&!o.userData.noOutline&&!o.material.transparent&&o.material.side!==THREE.DoubleSide)list.push(o)});
  list.forEach(function(o){var c=new THREE.Mesh(o.geometry,outlineMat(w));c.userData.noShadow=true;c.userData.noOutline=true;c.raycast=function(){};o.add(c)})}

// 구름: 하늘 높이 깔린 구름층을 노이즈로 그린다. 바람에 흘러가며 모양이 천천히 바뀌고, 해 쪽 면은 밝고 아래와 그늘진 쪽은 어둡다.
// 덮인 정도와 두께는 날씨를 따른다. 낮게 볼수록 구름층을 비스듬히 지나므로 지평선 쪽이 더 짙어 보인다
var cloudSys=(function(){
  var U={uOff:{value:new THREE.Vector2(0,0)},uCover:{value:.2},uDark:{value:0},uTime:{value:0},uLit:{value:new THREE.Color(1,1,1)},uShd:{value:new THREE.Color(.6,.65,.72)},uSunD:{value:new V3(0,1,0)},uPx:{value:800},uHz:{value:new THREE.Color()}};
  var oct=(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches)?4:6;
  var m=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:['uniform vec2 uOff;uniform float uCover,uDark,uTime;uniform vec3 uLit,uShd,uSunD,uHz;varying vec3 vW;',
      'float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1.,0.)),f.x),mix(hh(i+vec2(0.,1.)),hh(i+vec2(1.,1.)),f.x),f.y);}',
      'float fbm(vec2 p){float a=.5,s=0.;mat2 R=mat2(.8,-.6,.6,.8);for(int i=0;i<'+oct+';i++){s+=a*vn(p);p=R*p*2.03+1.7;a*=.5;}return s;}',
      'float dens(vec2 p,vec2 q){return fbm(p+q*.55)+.32*fbm(p*2.7+q+4.1);}',
      'void main(){vec3 vd=normalize(vW-cameraPosition);if(vd.y<=.0)discard;',
      'vec2 p=(vW.xz+uOff)*.0021;vec2 q=vec2(fbm(p*.6+vec2(0.,uTime*.006)),fbm(p*.6+vec2(5.2,1.3)-uTime*.004));',
      'float d=dens(p,q);float lo=1.08-uCover*.98;float c=smoothstep(lo,lo+.22+uCover*.12,d);if(c<.003)discard;',
      'vec2 ls=normalize(uSunD.xz+vec2(1e-4))*.05*(1.-.5*clamp(uSunD.y,0.,1.));float dl=dens(p+ls,q);',
      'float sh=clamp(.62+(d-dl)*4.2,0.,1.);sh=mix(sh,floor(sh*4.+.5)/4.,.22);sh*=1.-.45*smoothstep(lo+.15,lo+.6,d)*uCover;',
      'vec3 col=mix(uShd,uLit,sh);',
      'float thick=min(1./max(vd.y,.05),7.);float a=1.-exp(-c*(1.3+uCover*1.4)*thick);',
      // 멀리 있는 구름일수록 수평선 빛에 물들어, 구름층 끝이 하늘에 녹아든다
      'float cd=length(vW.xz-cameraPosition.xz);col=mix(col,uHz,smoothstep(300.,1300.,cd)*.85);a*=1.-smoothstep(1050.,1550.,cd);',
      'gl_FragColor=vec4(col,a*.97);}'].join('\n')});
  var plane=new THREE.Mesh(new THREE.PlaneGeometry(3200,3200,1,1),m);plane.rotation.x=-Math.PI/2;plane.position.y=150;plane.frustumCulled=false;plane.renderOrder=-5;scene.add(plane);
  return {U:U,update:function(dt,t,wind,wdx,wdz,cover,dark,storm,lit,shd){
    var v=3+wind*16;U.uOff.value.x-=wdx*v*dt;U.uOff.value.y-=wdz*v*dt;U.uTime.value=t;U.uCover.value=cover;U.uDark.value=dark;U.uLit.value.copy(lit);U.uShd.value.copy(shd);
    U.uSunD.value.copy(sunDirV);plane.position.x=camera.position.x;plane.position.z=camera.position.z;plane.position.y=150-storm*45}};
})();

// 바람 줄기: 바람이 불면 공중에 가늘고 흰 물결선이 바람을 따라 그려졌다 사라진다(folio-2025의 WindLines를 옮김).
// 풀과 나무를 흔드는 돌풍 무늬(windGustAt)가 센 자리에서 생겨 그 돌풍과 같은 빠르기로 흘러간다. 그래서 줄기가 지나가는 자리의 풀과 야자 잎이 함께 크게 휜다.
// 돌풍이 셀수록 크게 굽이치고 잘게 떨리며, 야자 줄기·덤불·바위를 지날 때는 옆으로 비켜 가며 휘감긴다. 폭은 늘 카메라를 향한다
var windLines=(function(){var NL=8,SEG=48,LEN=7,NO=8,nv=(SEG+1)*2,aR=new Float32Array(NL*nv),aS=new Float32Array(NL*nv),aI=new Float32Array(NL*nv),pos=new Float32Array(NL*nv*3),idx=[];
  for(var l=0;l<NL;l++)for(var k=0;k<=SEG;k++)for(var sd=0;sd<2;sd++){var v=l*nv+k*2+sd;aR[v]=k/SEG;aS[v]=sd?1:-1;aI[v]=l}
  for(var l2=0;l2<NL;l2++)for(var k2=0;k2<SEG;k2++){var b=l2*nv+k2*2;idx.push(b,b+1,b+2,b+1,b+3,b+2)}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aR',new THREE.BufferAttribute(aR,1));g.setAttribute('aS',new THREE.BufferAttribute(aS,1));g.setAttribute('aI',new THREE.BufferAttribute(aI,1));g.setIndex(idx);
  function arr(n,y){var o=[];for(var i=0;i<n;i++)o.push(new THREE.Vector4(0,y,0,0));return o}
  var U={uA:{value:arr(NL,-99)},uB:{value:arr(NL,0)},uC:{value:arr(NL,0)},uO:{value:arr(NO,0)},uLen:{value:LEN},uTh:{value:.06},uL:{value:1},uT:{value:0}};
  var m=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:['attribute float aR,aS,aI;uniform vec4 uA['+NL+'],uB['+NL+'],uC['+NL+'],uO['+NO+'];uniform float uLen,uTh,uT;varying float vA,vS;',
      'void main(){int i=int(aI+.5);vec4 A=uA[i],B=uB[i],C=uC[i];vec3 dir=vec3(B.x,0.,B.y),sdv=vec3(-B.y,0.,B.x);float gs=C.x;',
      // 선 모양: 바람 방향으로 9m. 큰 굽이는 돌풍이 셀수록 깊고, 그 위로 잔떨림이 선을 따라 흘러간다
      '  float s=(aR-.5)*uLen,a1=aR*6.28+B.z+uT*.7,a2=aR*4.4+B.z*1.7,a3=aR*31.-uT*(6.+gs*6.)+B.z,am=.06+.1*gs;',
      '  vec3 p=A.xyz+dir*s+vec3(0.,am*sin(a1)+.025*gs*sin(a3),0.)+sdv*(.12*sin(a2)+.02*gs*sin(a3*.8+1.3));',
      // 장애물: 줄기·덤불·바위 둘레에서는 바깥으로 밀려나 비켜 가고, 뒤쪽으로 말려 들며 위아래로 감긴다
      '  for(int k=0;k<'+NO+';k++){vec4 O=uO[k];if(O.z<=0.)continue;vec2 d=p.xz-O.xy;float dl=max(length(d),.001),f=exp(-pow(max(dl-O.z,0.)/1.3,2.))*step(p.y,O.w);',
      '    vec2 sid=vec2(-dir.z,dir.x)*sign(dot(d,vec2(-dir.z,dir.x))+.001);p.xz+=(d/dl*.5+sid*.35)*f*(1.+.4*gs);}',
      '  vec3 T=normalize(dir*uLen+vec3(0.,am*6.28*cos(a1),0.)+sdv*(.12*4.4*cos(a2)));',
      '  vec3 N=normalize(cross(T,normalize(cameraPosition-p)));',
      // 굵기: 양 끝은 가늘고, 진행도를 따라 선 위를 지나가는 머리 부분만 굵다
      '  float base=smoothstep(0.,1.,1.-abs(aR-.5)*2.),prog=smoothstep(0.,1.,1.-abs(aR-(A.w*2.6-.8))*2.2);',
      '  p+=N*aS*uTh*.5*base*prog;vS=aS;vA=B.w*base*prog*(1.-smoothstep(16.,28.,length(cameraPosition-p)));',
      '  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}'].join('\n'),
    fragmentShader:'uniform float uL;varying float vA,vS;void main(){float e=1.-smoothstep(0.,1.,abs(vS));gl_FragColor=vec4(vec3(.93,.97,1.)*(.45+.55*uL),vA*e*e);}'});
  var mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;mesh.renderOrder=7;scene.add(mesh);
  var L=[],nextT=1.5;for(var q=0;q<NL;q++)L.push({on:false,t:0,dur:1,x:0,y:0,z:0,h:1,gs:0});
  return {update:function(dt,who,cam,wind,wdx,wdz,light,allow){
    var k=smoothstep(.28,1,wind),sp=1.6+windStrU.value*4;U.uL.value=light;U.uT.value+=dt;nextT-=dt;
    if(nextT<=0){nextT=lerp(8,.4,k)*(.6+Math.random()*.8);
      var f=L.find(function(o){return !o.on});
      if(f&&k>0&&light>.15&&allow){var fx=who.position.x-cam.position.x,fz=who.position.z-cam.position.z,fl=Math.hypot(fx,fz)||1;fx/=fl;fz/=fl;
        // 사람 앞쪽 3~20m에서 자리 여섯 곳을 골라 돌풍이 가장 센 곳에 띄운다. 돌풍이 약하면 이번에는 건너뛰고 곧 다시 본다
        var best=null,bg=-1;for(var c=0;c<6;c++){var fwd=3+Math.random()*17,sid=(Math.random()-.5)*(8+fwd*.9),x=who.position.x+fx*fwd-fz*sid,z=who.position.z+fz*fwd+fx*sid,gg=windGustAt(x,z);if(gg>bg){bg=gg;best=[x,z]}}
        if(bg<.45)nextT=.3;
        else{var ja=(Math.random()-.5)*.24,cs=Math.cos(ja),sn=Math.sin(ja);
          f.on=true;f.t=0;f.dur=lerp(1.8,1,k)*(.8+Math.random()*.4);f.x=best[0];f.z=best[1];f.h=.3+Math.random()*1.5;f.y=Math.max(W.height(f.x,f.z),W.sea)+f.h;
          f.dx=wdx*cs-wdz*sn;f.dz=wdx*sn+wdz*cs;f.ph=Math.random()*6.28;f.a=(.09+.07*k)*(.6+Math.random()*.4);f.gs=bg}}}
    // 가까운 장애물 몇 개만 셰이더에 넘긴다(높이 w: 그보다 높이 지나가는 줄기는 영향 없음)
    var obs=W.windObs||[],px=who.position.x,pz=who.position.z,near=[];
    for(var j=0;j<obs.length;j++){var o0=obs[j],dd=(o0.x-px)*(o0.x-px)+(o0.z-pz)*(o0.z-pz);if(dd<900)near.push([dd,o0])}
    near.sort(function(a1,b1){return a1[0]-b1[0]});
    for(var n=0;n<NO;n++){var O=U.uO.value[n],ob=near[n]&&near[n][1];if(ob)O.set(ob.x,ob.z,ob.r,W.height(ob.x,ob.z)+(ob.r<.6?9:ob.r*1.6));else O.set(0,0,0,0)}
    for(var i=0;i<NL;i++){var o=L[i],A=U.uA.value[i],B=U.uB.value[i],C=U.uC.value[i];
      if(!o.on){A.y=-99;B.w=0;continue}
      // 돌풍과 같은 빠르기로 흘러가며, 땅 높이를 따라 오르내린다. 지금 자리의 돌풍 세기로 굽이와 떨림이 바뀐다
      o.t+=dt;o.x+=o.dx*sp*dt;o.z+=o.dz*sp*dt;if(o.t>=o.dur){o.on=false;A.y=-99;B.w=0;continue}
      o.y+=(Math.max(W.height(o.x,o.z),W.sea)+o.h-o.y)*Math.min(1,dt*2);o.gs+=(windGustAt(o.x,o.z)-o.gs)*Math.min(1,dt*3);
      A.set(o.x,o.y,o.z,o.t/o.dur);B.set(o.dx,o.dz,o.ph,o.a*(.65+.35*o.gs)*(1-WR.camK));C.set(o.gs,0,0,0)}
    mesh.visible=L.some(function(o){return o.on})}};
})();
// 빗줄기: 카메라 둘레 상자 안에서 떨어지고, 바람에 비스듬히 날린다
var rainSys=(function(){var N=(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches)?2600:5200,pos=new Float32Array(N*6),seed=new Float32Array(N*3),r=mulberry32(31);
  for(var i=0;i<N;i++){seed[i*3]=(r()-.5)*70;seed[i*3+1]=r()*36;seed[i*3+2]=(r()-.5)*70}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  var m=new THREE.LineBasicMaterial({color:0xc9d6e2,transparent:true,opacity:.35,depthWrite:false});
  var L=new THREE.LineSegments(g,m);L.frustumCulled=false;L.renderOrder=8;scene.add(L);
  return {update:function(dt,cam,rain,wind,wdx,wdz,light){
    var n=Math.floor(N*Math.min(1,rain*1.05)),fall=6+rain*14,slx=wdx*wind*fall*.55,slz=wdz*wind*fall*.55,len=.25+rain*.9,a=pos;
    L.visible=n>0;g.setDrawRange(0,n*2);m.opacity=(.18+rain*.3)*(.35+.65*light);
    for(var i=0;i<n;i++){var y=seed[i*3+1]-dt*fall*(.85+(i%7)*.04);if(y<-4)y+=40;seed[i*3+1]=y;seed[i*3]+=slx*dt;seed[i*3+2]+=slz*dt;
      var x=cam.x+(((seed[i*3]-cam.x+35)%70+70)%70)-35,z=cam.z+(((seed[i*3+2]-cam.z+35)%70+70)%70)-35,yy=cam.y-6+y,dx=slx/fall*len,dz=slz/fall*len;
      a[i*6]=x;a[i*6+1]=yy;a[i*6+2]=z;a[i*6+3]=x+dx;a[i*6+4]=yy+len;a[i*6+5]=z+dz}
    g.attributes.position.needsUpdate=true}}})();

// 번개: 먼바다로 떨어지는 갈라진 빛줄기와 하늘 전체의 번쩍임
var bolt=(function(){var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(60*3),3));
  var m=new THREE.LineBasicMaterial({color:0xeef3ff,transparent:true,opacity:0,depthWrite:false,fog:false});var L=new THREE.Line(g,m);L.frustumCulled=false;L.renderOrder=9;scene.add(L);
  return {L:L,strike:function(cx,cz){var a=Math.random()*6.283,d=170+Math.random()*120,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d,p=g.attributes.position.array,y=95;
    for(var i=0;i<60;i++){p[i*3]=x;p[i*3+1]=y;p[i*3+2]=z;x+=(Math.random()-.5)*7;z+=(Math.random()-.5)*7;y-=95/59}g.attributes.position.needsUpdate=true;g.setDrawRange(0,60)}}})();

// 모닥불 연기: 비가 오거나 바람이 불면 더 짙고, 바람 방향으로 눕는다
var smokeSys=(function(){var N=60,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));g.setAttribute('a',new THREE.BufferAttribute(new Float32Array(N),1));g.setAttribute('s',new THREE.BufferAttribute(new Float32Array(N),1));
  var m=new THREE.ShaderMaterial({uniforms:{uL:{value:1}},transparent:true,depthWrite:false,
    vertexShader:'attribute float a;attribute float s;varying float vA;void main(){vA=a;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=s*320./-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform float uL;varying float vA;void main(){float r=length(gl_PointCoord-.5);float m=smoothstep(.5,0.,r);gl_FragColor=vec4(vec3(.55,.55,.56)*(.25+.6*uL),m*vA*.35);}'});
  var P=new THREE.Points(g,m);P.frustumCulled=false;P.renderOrder=6;scene.add(P);var parts=[];for(var i=0;i<N;i++)parts.push({l:1});var acc=0;
  return {update:function(dt,base,amount,wdx,wdz,wind,light){acc+=dt*amount*14;
    while(acc>1){acc--;for(var i=0;i<N;i++)if(parts[i].l>=1){parts[i]={p:base.clone().add(new V3((Math.random()-.5)*.3,.6,(Math.random()-.5)*.3)),l:0,life:3+Math.random()*2};break}}
    var A=g.attributes;for(var j=0;j<N;j++){var q=parts[j];if(q.l>=1){A.a.array[j]=0;continue}q.l+=dt/q.life;
      q.p.x+=wdx*wind*3.5*dt;q.p.z+=wdz*wind*3.5*dt;q.p.y+=dt*(1.3-wind*.6);A.position.array[j*3]=q.p.x;A.position.array[j*3+1]=q.p.y;A.position.array[j*3+2]=q.p.z;
      A.a.array[j]=Math.sin(Math.min(1,q.l)*Math.PI)*.9;A.s.array[j]=.5+q.l*2.6}
    A.position.needsUpdate=true;A.a.needsUpdate=true;A.s.needsUpdate=true;m.uniforms.uL.value=light}}})();

// 야자 잎 하나: 위로 솟았다가 끝이 처지는 곡면. 잎맥을 따라 갈라진 틈은 셰이더에서 잘라 낸다
var windU={value:0};
var FROND=(function(){
  var rows=16,cols=6,pos=[],uv=[],idx=[],L=4.4;
  for(var r=0;r<=rows;r++){var s=r/rows,w=0.8*Math.pow(Math.sin(Math.PI*(0.05+0.95*s)),0.6)*(1-0.3*s),z=L*(s-0.22*s*s),y=L*(0.42*s-0.62*s*s);
    for(var c=0;c<=cols;c++){var a=c/cols*2-1;pos.push(a*w,y-Math.pow(Math.abs(a),1.3)*w*0.75,z);uv.push(a,s)}}
  for(var r2=0;r2<rows;r2++)for(var c2=0;c2<cols;c2++){var i=r2*(cols+1)+c2;idx.push(i,i+cols+1,i+1,i+1,i+cols+1,i+cols+2)}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('fuv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
})();
var FROND_MAT=(function(){var m=mat(0xffffff,{roughness:.62,side:THREE.DoubleSide});
  m.onBeforeCompile=function(sh){sh.uniforms.uWT=windU;
    sh.vertexShader='uniform float uWT;attribute vec2 fuv;attribute float aTH;varying vec2 vF;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvF=fuv;\n#ifdef USE_INSTANCING\ntransformed.y+=sin(uWT*(1.2+uWS*1.6)+instanceMatrix[3].x*.4+instanceMatrix[3].z*.3+position.z*.6)*.035*(.45+uWS*1.1)*position.z*position.z;\n#endif');
    sh.fragmentShader='varying vec2 vF;\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat fa=abs(vF.x);if(fa>0.16&&fract(vF.y*19.+fa*1.6)>0.68)discard;\ndiffuseColor.rgb*=mix(0.68,1.12,vF.y)*(0.78+0.22*smoothstep(0.,0.12,fa));')};
  return windify(m,'frond')})();
// 풀밭은 사람 둘레의 네모난 구역에만 빽빽하게 심고, 사람이 움직이면 구역 밖으로 나간 포기를 반대편으로 옮겨 심는다. 구역 끝에서는 키를 줄여 사라지게 한다
var grassU={c:{value:new THREE.Vector2()},r:{value:33}};
function patchMat(hex,o,sway){var m=mat(hex,o);
  m.onBeforeCompile=function(sh){sh.uniforms.uWT=windU;sh.uniforms.uGC=grassU.c;sh.uniforms.uGR=grassU.r;sh.uniforms.uSw={value:sway};
    sh.vertexShader='uniform float uWT,uGR,uSw;uniform vec2 uGC;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\ntransformed*=1.-smoothstep(uGR*.72,uGR*.98,distance(instanceMatrix[3].xz,uGC));\ntransformed.x+=sin(uWT*1.8+instanceMatrix[3].x*.6+instanceMatrix[3].z*.5)*uSw*position.y*position.y;\n#endif')};
  return m}
var GRASS_MAT=windify(patchMat(0xffffff,{roughness:.9,side:THREE.DoubleSide,vertexColors:true},0),'grass'), FLOWER_Y=windify(patchMat(0xf7cf2e,{roughness:.7},0),'flower'), FLOWER_W=windify(patchMat(0xf4f6f2,{roughness:1},0),'flower');
function makePatch(geo,m,count,S,rng,ok,size){
  var im=new THREE.InstancedMesh(geo,m,count),d=new Float32Array(count*5),last=new Int32Array(count*2).fill(1e9);
  for(var i=0;i<count;i++){d[i*5]=rng()*S;d[i*5+1]=rng()*S;d[i*5+2]=rng()*6.283;d[i*5+3]=rng();d[i*5+4]=rng()}
  im.frustumCulled=false;im.userData.noShadow=true;im.receiveShadow=true;world.add(im);
  return {im:im,d:d,last:last,S:S,ok:ok,size:size,n:count};
}
function updPatch(P,cx,cz){
  var ch=false,S=P.S,d=P.d,last=P.last;
  for(var i=0;i<P.n;i++){var kx=Math.round((cx-d[i*5])/S),kz=Math.round((cz-d[i*5+1])/S);
    if(kx===last[i*2]&&kz===last[i*2+1])continue; last[i*2]=kx;last[i*2+1]=kz;
    var x=d[i*5]+kx*S,z=d[i*5+1]+kz*S,h=W.height(x,z);
    if(P.ok(x,z,h,d[i*5+3])){dummy.position.set(x,h-.02,z);dummy.rotation.set(0,d[i*5+2],0);dummy.scale.setScalar(P.size(d[i*5+4]))}else{dummy.position.set(x,-60,z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(.0001)}
    dummy.updateMatrix();P.im.setMatrixAt(i,dummy.matrix);ch=true}
  if(ch)P.im.instanceMatrix.needsUpdate=true;
}
// 땅: 모래알, 바람결 무늬, 풀밭 얼룩, 들쭉날쭉한 풀 가장자리를 픽셀마다 그린다
// 천막 천: 올이 보이는 거친 천에 판을 이은 솔기와 바늘땀, 두 겹 접은 단, 비와 볕에 생긴 얼룩과 바랜 자국
function canvasMat(hex){
  var m=mat(hex,{roughness:.97,side:THREE.DoubleSide});
  m.onBeforeCompile=function(sh){
    sh.vertexShader='varying vec2 vCu;varying vec3 vCw;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCu=uv;vCw=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader=['varying vec2 vCu;varying vec3 vCw;',
      'float ch(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float cn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(ch(i),ch(i+vec2(1.,0.)),f.x),mix(ch(i+vec2(0.,1.)),ch(i+vec2(1.,1.)),f.x),f.y);}',
      ''].join('\n')+sh.fragmentShader.replace('#include <color_fragment>',['#include <color_fragment>',
      '{vec2 m=vec2(vCu.x*4.3,vCu.y*3.51);float cd=distance(cameraPosition,vCw);',
      // 해진 가장자리: 군데군데 찢겨 들쭉날쭉하고, 끝에는 올이 풀려 술처럼 늘어진다
      ' float ex=min(vCu.x,1.-vCu.x)*4.3,eyy=min(vCu.y,1.-vCu.y)*3.51,ee=min(ex,eyy),ea=ex<eyy?m.y:m.x;',
      ' float tear=.07*pow(cn(vec2(ea*2.3,ex<eyy?3.:9.)),2.)+.035*cn(vec2(ea*9.,1.));if(ee<tear)discard;',
      ' if(ee<tear+.045&&fract(ea*55.+cn(vec2(ea*20.,5.))*.6)<.5)discard;',
      // 올 결: 가까이서만 보이고 멀어지면 고르게 사라진다
      ' float wv=sin(m.x*190.)*sin(m.y*190.+sin(m.x*7.)*.6);float grain=1.+.07*wv*(1.-smoothstep(3.,10.,cd))-.05*cn(m*vec2(40.,6.));',
      // 네 가장자리를 접어 꿰맨 단과 바늘땀
      ' float ey=ee;float hem=1.-smoothstep(.13,.15,ee);float hst=(1.-smoothstep(.004,.009,abs(ee-.11)))*step(.45,fract(ea*30.));',
      // 얼룩과 바랜 자국은 세계 좌표로 찍어 판마다 다르게 보인다. 단 가까이는 흙물이 들었다
      ' float n1=cn(vCw.xz*1.1+vCw.y*.7)*.6+cn(vCw.xz*3.3-vCw.y)*.4,n2=cn(vCw.xz*.5+vCw.y*.3+7.);',
      ' vec3 c=diffuseColor.rgb*grain;',
      ' c=mix(c,c*vec3(.78,.74,.66),smoothstep(.58,.82,n1)*.55);c=mix(c,c*vec3(1.1,1.08,1.03),smoothstep(.55,.85,n2)*.35);',
      ' c=mix(c,c*vec3(.8,.72,.6),hem*.5+(1.-smoothstep(.06,.35,ey))*smoothstep(.4,.7,n1)*.3);',
      ' c*=1.-.35*hst*(1.-smoothstep(3.,8.,cd));',
      ' diffuseColor.rgb=c;}'].join('\n'))};
  m.customProgramCacheKey=function(){return 'canvas'};return m}
// 천막이 바람에 펄럭인다: 지붕 판마다 위쪽은 묶여 있고 아래 끝단으로 갈수록, 지붕 양 끝으로 갈수록 크게 흔들린다
// 바람이 미는 쪽 면은 눌리고 반대쪽 면은 들리며, 센 바람일수록 크게 펄럭인다. 꼭짓점을 직접 옮겨 그림자도 같이 움직인다
function updTent(t,wk,wdx,wdz){
  var T=W.tent;if(!T)return;if(wk<.01&&T.rest)return;T.rest=wk<.01;
  var ry=W.shelter.rotation.y,cr=Math.cos(ry),sr=Math.sin(ry),ridgeD=Math.abs(wdx*sr+wdz*cr);
  for(var k=0;k<T.strips.length;k++){var S=T.strips[k],b=S.base,a=S.g.attributes.position,arr=a.array,s=S.s,ph=S.ph;
    var dd=(wdx*cr-wdz*sr)*s,amp=wk*(.05+.07*(.5+.5*dd)),bil=wk*.16*dd,g=.55+.45*Math.sin(t*.9+ph)*Math.sin(t*1.7+ph*.5);
    for(var i=0;i<arr.length;i+=3){var bx=b[i],w=clamp((1.755+s*bx)/3.51,0,1.05),aa=-b[i+2],ea=Math.abs(aa);
      // 천 가운데는 바람을 받아 부풀거나 눌리고, 아래 끝단과 양 끝은 물결치며 펄럭인다
      var mid=4*w*(1-Math.min(w,1))*Math.cos(aa*.73),endK=smoothstep(1.2,2.15,ea)*(.35+.65*ridgeD),edge=Math.pow(w,3)+endK*w*1.6;
      var f=Math.sin(t*8.5+aa*2.2-w*5.+ph)*.6+Math.sin(t*13.1-aa*3.4-w*7.+ph*1.9)*.4;
      var D=bil*g*(mid*(.8+.2*Math.sin(t*3.1+ph))+.4*edge)+amp*g*f*(edge+mid*.25);
      // 지주대(길이 방향 ±1.7)는 천 바로 안쪽에 있다(아래쪽은 처짐까지 빼면 여유 약 3cm). 그 줄에 걸리는 곳은 안쪽으로 2cm 남짓 넘게
      // 꺼지지 못해 지주대에 걸쳐 눌리고, 지주대에서 45cm 넘게 떨어진 곳과 바깥으로 부푸는 쪽은 그대로 펄럭인다
      var lim=.015+smoothstep(.12,.45,Math.abs(ea-1.7));if(D<-lim)D=-lim+(D+lim)*.06;
      arr[i+1]=b[i+1]+D}
    a.needsUpdate=true;S.g.computeVertexNormals()}}
function terrainMat(peak,cx,cz){
  var TN=['float th1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
   'float tn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(th1(i),th1(i+vec2(1.,0.)),f.x),mix(th1(i+vec2(0.,1.)),th1(i+vec2(1.,1.)),f.x),f.y);}',
   'float tf(vec2 p){return tn(p)*.55+tn(p*2.13+7.)*.3+tn(p*4.31+3.)*.15;}',
   'float tbump(vec2 q,float sM){return tn(q*5.)*.55+tn(q*14.)*.25+sM*0.3*sin((q.x*.9+q.y*.5)*2.4+tn(q*.6)*6.);}'].join('\n')+'\n';
  var TCOL=['{float h=vWp.y;vec2 q=vWp.xz;float n1=tf(q*0.18),n2=tf(q*1.7),n3=tn(q*9.),n4=tn(q*26.);',
   'vec3 c=mix(vec3(.72,.87,.79),vec3(.80,.72,.55),clamp((h+1.5)/1.4,0.,1.));',
   'c=mix(c,vec3(.97,.90,.72),smoothstep(-0.1,0.12,h));',
   'float rip=sin((q.x*.9+q.y*.5)*2.4+tn(q*.6)*6.);',
   'c*=1.-0.06*n3-0.04*n4+0.03*rip*smoothstep(.2,.5,h);',
   'c=mix(c,vec3(.70,.60,.46),step(0.9,n4)*step(0.55,n3)*0.45);',
   'float gE=smoothstep(0.95,1.3,h+(n2-.5)*.55+(n3-.5)*.18)*smoothstep(4.4,7.2,distance(q,uCamp)+(n2-.5)*2.2);',
   'c=mix(c,vec3(.90,.81,.62),(1.-smoothstep(4.4,7.2,distance(q,uCamp)+(n2-.5)*2.2))*smoothstep(0.95,1.2,h)*0.55);',
   'vec3 g=mix(vec3(.58,.80,.46),vec3(.42,.68,.40),n1)*(0.88+0.24*n2);g=mix(g,g*vec3(1.1,1.06,.78),step(0.62,n3)*0.3);',
   'g=mix(g,vec3(.72,.82,.54),clamp((h-(0.9+uPeak*0.55))/(uPeak*0.3),0.,1.));',
   'c=mix(c,g*(0.82+0.18*smoothstep(0.,.5,gE)),gE);c*=1.-.3*uWetG*(1.-gE*.45);'+
   // 파도가 닿았던 높이 아래는 젖어 어둡고, 위로 갈수록 점점 말라 간다
   // 젖은 모래: 마른 모래 → 축축한 모래 → 젖은 모래 세 단계. 물가 바로 위 물을 머금은 모래에는 윤기가 돈다
   // 물이 빠진 자리(지금 물가와 최근에 물이 닿았던 높이 사이)에는 거품이 기포 점으로 남았다가, 그 높이가 내려오며 위에서부터 사라진다
   '{vec4 wt=texture2D(uWetT,vec2(fract(atan(vWp.z,vWp.x)/6.2831853+1.)+.5/220.,.5));float wl=wt.r*1.6-.6,Lc=tSwashL(),rc=wt.b*1.6-.6;'+
   'float wk=smoothstep(wl+.1+(n3-.5)*.05,wl-.32,h)*(1.-gE),dk=smoothstep(wl+.45,wl+.08,h)*(1.-gE);'+
   'c=mix(c,c*vec3(.94,.9,.84),dk*.8);c=mix(c,c*vec3(.85,.79,.74),wk*.8);'+
   'tSheen=(1.-smoothstep(Lc+.015,Lc+.09+(n3-.5)*.03,h))*step(Lc-.02,h)*(1.-gE);'+
   'float ab=h-Lc,band=max(rc-Lc,0.),str=step(0.,ab)*(1.-smoothstep(band-.01,band+.005,ab))*(.45+.55*smoothstep(band*.4,band,ab))*smoothstep(.01,.04,band)*(1.-gE);'+
   'c=mix(c,vec3(.95,.95,.92),bubbles(vWp.xz,str*.9,distance(cameraPosition,vWp)/uPx)*.9);}'+
   'diffuseColor.rgb=pow(c,vec3(2.2));}',
   '{float wlc=tSwashL();float dpt=max(wlc,uSeaL-.12)-vWp.y;float uw=smoothstep(.05,.7,dpt)*(1.-smoothstep(1.,2.8,dpt));if(uw>0.){vec2 cq=vWp.xz*1.35;float ct=uTC*.9;float c1=sin(cq.x+sin(cq.y*1.7+ct)*1.3+ct*.7),c2=sin(cq.y*1.1+sin(cq.x*1.9-ct*.8)*1.4-ct*.6);float cs=pow(1.-abs(c1*c2),9.);diffuseColor.rgb=diffuseColor.rgb*(1.-.08*uw)+vec3(.85,1.,.95)*cs*.13*uw*uCaus;}}'].join('\n');
  var TNRM='{vec2 q=vWp.xz;float sM=1.-smoothstep(0.9,1.3,vWp.y);float e=0.07,b0=tbump(q,sM),bx=tbump(q+vec2(e,0.),sM),bz=tbump(q+vec2(0.,e),sM);normal=normalize(normal+mat3(viewMatrix)*vec3(b0-bx,0.,b0-bz)*(0.9+0.9*(1.-sM)));}';
  var m=new THREE.MeshStandardMaterial({roughness:.93,metalness:0});
  // 지금 물가 높이는 물 셰이더와 같은 식으로 픽셀마다 구한다. 220칸 텍스처로 받으면 파도가 해안을 따라 비스듬히 밀려오는 앞머리에서
  // 칸 사이 보간이 실제 물보다 앞서, 물이 닿지 않은 모래의 거품이 해안에 수직인 직선으로 잘려 나간다
  var TSW=['uniform float uSwT,uSwSea,uSwWind,uSwBig,uSwWindA,uSwCalm;',
    'float tSwashL(){float th=atan(vWp.z,vWp.x);',
    '  float x=uSwT/5.5+0.35*sin(th*2.+1.)+0.2*sin(th*5.)+0.12*sin(th*11.+2.3)+0.07*sin(th*19.+.7)+9.75,ph=fract(x),n=floor(x);',
    '  float u=(.95+.4*(sin(n*2.3999+1.3)*.6+sin(n*.7071)*.4))*(ph<0.32?sin(ph/0.32*1.5708):pow(max(cos((ph-0.32)/0.68*1.5708),0.),1.6));',
    '  float dw=0.35+0.65*pow(0.5+0.5*cos(th-uSwWindA),1.5);',
    '  return uSwSea+min(0.6-uSwSea,0.03+(0.17+0.05*sin(th*7.+2.))*(1.+(uSwWind*0.3+uSwBig*0.9)*dw)*u*uSwCalm);}',''].join('\n');
  m.onBeforeCompile=function(sh){sh.uniforms.uPeak={value:peak};sh.uniforms.uPx=PXU;sh.uniforms.uWetG=terrWetU;sh.uniforms.uSeaL=causU.sea;sh.uniforms.uWetT=wetTexU;sh.uniforms.uTC=windU;sh.uniforms.uCaus=causU.k;sh.uniforms.uCamp={value:new THREE.Vector2(cx,cz)};
    sh.uniforms.uSwT=waterU.uTime;sh.uniforms.uSwSea=waterU.uSea;sh.uniforms.uSwWind=waterU.uWind;sh.uniforms.uSwBig=waterU.uBig;sh.uniforms.uSwWindA=waterU.uWindA;sh.uniforms.uSwCalm=waterU.uCalm;
    sh.vertexShader='varying vec3 vWp;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWp=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader='varying vec3 vWp;uniform float uPeak,uWetG,uSeaL,uTC,uCaus,uPx;uniform vec2 uCamp;uniform sampler2D uWetT;float tSheen=0.;\n'+TN+TSW+BUB_GLSL+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+TCOL).replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n'+TNRM).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.3,tSheen);')};
  return m;
}
// 풀 한 포기: 가늘고 끝이 뾰족한 잎 열두 가닥이 사방으로 휜다. 법선을 위로 두어 땅과 같은 밝기로 보이게 한다
function tuftGeo(rng){
  var pos=[],nor=[],cl=[],idx=[],n=0;
  for(var b=0;b<12;b++){var a=rng()*6.283,h=.3+rng()*.3,w=.03+rng()*.018,lean=.08+rng()*.22,r0=Math.sqrt(rng())*.38,a0=rng()*6.283,ox=Math.cos(a0)*r0,oz=Math.sin(a0)*r0,ca=Math.cos(a),sa=Math.sin(a);
    for(var r=0;r<=2;r++){var u=r/2,ww=w*(1-u*.92),out=lean*u*u;
      for(var sd=-1;sd<=1;sd+=2){pos.push(ox+ca*out-sa*ww*sd,h*u,oz+sa*out+ca*ww*sd);nor.push(0,1,0);var cc=.42+.75*u;cl.push(cc,cc,cc)}}
    for(var r2=0;r2<2;r2++){var i=n+r2*2;idx.push(i,i+1,i+2,i+1,i+3,i+2)} n+=6}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));g.setIndex(idx);return g;
}
function trunkGeo(h,lean){
  var pts=[new V3(0,-.4,0),new V3(lean*.2,h*.35,0),new V3(lean*.62,h*.72,0),new V3(lean,h,0)],curve=new THREE.CatmullRomCurve3(pts);
  var ts=26,rs=12,g=new THREE.TubeGeometry(curve,ts,.3,rs,false),p=g.attributes.position,c=new V3(),cl=new Float32Array(p.count*3);
  for(var i=0;i<=ts;i++){var u=i/ts;curve.getPointAt(u,c);var f=lerp(1.1,.56,u)*(i%2?1.06:.95);if(u<.14)f*=1+(.14-u)*4.5;var sh=(i%2?1:.7)*lerp(.82,1.05,u);
    for(var j=0;j<=rs;j++){var k=i*(rs+1)+j;p.setXYZ(k,c.x+(p.getX(k)-c.x)*f,c.y+(p.getY(k)-c.y)*f,c.z+(p.getZ(k)-c.z)*f);cl[k*3]=sh;cl[k*3+1]=sh;cl[k*3+2]=sh}}
  g.setAttribute('color',new THREE.BufferAttribute(cl,3));g.computeVertexNormals();return g;
}
function makeRibbon(n,op){
  var g=new THREE.BufferGeometry(),idx=[];for(var i=0;i<n;i++){var a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array((n+1)*6),3));g.setIndex(idx);
  var m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:op,depthWrite:false,side:THREE.DoubleSide}));
  m.frustumCulled=false;m.renderOrder=2;m.userData.noShadow=true;return m;
}
var WHITE=new THREE.Color(1,1,1), FP=140, tmpC=new THREE.Color();
// 해변 위에 얹는 띠: 젖은 모래, 밀려 올라오는 물막, 거품. 꼭짓점마다 투명도를 준다
function makeStrip(n,rows,rgb,op,off,order){
  var g=new THREE.BufferGeometry(),cnt=(n+1)*rows,idx=[];
  for(var i=0;i<n;i++)for(var r=0;r<rows-1;r++){var a=i*rows+r,b=a+rows;idx.push(a,b,a+1,a+1,b,b+1)}
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3));g.setAttribute('alpha',new THREE.BufferAttribute(new Float32Array(cnt),1));g.setIndex(idx);
  var m=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Vector3(rgb[0],rgb[1],rgb[2])},opacity:{value:op},lum:{value:1}},
    vertexShader:'attribute float alpha;varying float vA;void main(){vA=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 color;uniform float opacity;uniform float lum;varying float vA;void main(){gl_FragColor=vec4(color*lum,vA*opacity);}',
    transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:off,polygonOffsetUnits:off}));
  m.frustumCulled=false;m.renderOrder=order;m.userData.noShadow=true;m.userData.rows=rows;return m;
}
// 해변은 기울기가 일정해서, 높이(level)만 알면 물가에서의 거리가 정해진다
function setRow(m,i,r,level,yoff,alpha){var k=i*m.userData.rows+r,p=m.geometry.attributes.position.array,d=W.rad[i]*(1-level*0.2444);
  p[k*3]=W.cs[i]*d;p[k*3+1]=level+yoff;p[k*3+2]=W.sn[i]*d;m.geometry.attributes.alpha.array[k]=alpha}
// 발자국: 모래 위에서만 찍히고, 물에 잠긴 곳에는 찍히지 않는다
// 첨벙: 물이 발목 이상 차오른 곳을 걸으면 발을 디딜 때마다 물방울이 튀고 물결 고리가 퍼진다. 깊을수록 크게 튄다
var footRipI=0;
function waterDepth(x,z){return W.swash[binOf(x,z)]-W.height(x,z)}
function footRipple(x,z,w){var v=waterU.uFoot.value[footRipI];footRipI=(footRipI+1)%6;v.set(x,z,0,w)}
function footSplash(x,z,k){var dp=waterDepth(x,z);if(dp<.025)return;var lvl=W.height(x,z)+dp,d=Math.min(dp,.9);
  sprayEmit(W.whale,new V3(x,lvl,z),Math.round(12+d*50),{spread:.2+d*.2,up:2.2+d*5.5,out:.8+d*1.5,life:.8,s0:.24,s1:.5,g:13,drag:.3});
  if(d>.25)sprayEmit(W.whale,new V3(x,lvl,z),Math.round(d*14),{spread:.25,up:1,out:.4,life:1.1,s0:.35,s1:.8,g:6,drag:1});
  footRipple(x,z,Math.min(1,.45+d*1.6)*k)}
function stamp(x,z,rot){
  var h=W.height(x,z); if(h<-0.03||h>1.02)return;
  var a=Math.atan2(z,x); if(a<0)a+=6.2832; var bin=Math.round(a/6.2832*W.N)%W.N;
  if(W.swash[bin]>h+0.02)return;
  var i=state.printI; state.printI=(i+1)%FP;
  dummy.position.set(x,h+0.03,z); dummy.rotation.set(0,rot,0); dummy.scale.set(0.12,1,0.22); dummy.updateMatrix();
  W.prints.setMatrixAt(i,dummy.matrix); W.prints.instanceMatrix.needsUpdate=true;
  state.prints[i]={h:h,bin:bin,s:1,deep:h<W.wet[bin]?1:0.75};
}
function updRibbon(m,k,o,width,y,t,wob){
  var p=m.geometry.attributes.position.array,n=W.N;
  for(var i=0;i<=n;i++){var th=i/n*6.2832,d=W.rad[i]*k+o+(Math.sin(t*1.2+th*9)*.35+Math.sin(t*.7+th*4)*.3)*wob,c=Math.cos(th),s=Math.sin(th),w=width*(1+.35*Math.sin(th*13+t));
    p[i*6]=c*d;p[i*6+1]=y;p[i*6+2]=s*d;p[i*6+3]=c*(d+w);p[i*6+4]=y;p[i*6+5]=s*(d+w)}
  m.geometry.attributes.position.needsUpdate=true;
}

// 섬 사람: 긴 팔다리에 무릎과 팔꿈치 관절, 둥근 몸, 밀짚모자, 편지가 든 가방
function makePerson(){
  var g=new THREE.Group(), up=new THREE.Group(); g.add(up);
  var skin=mat(0xf2c39f,{roughness:.6}), shirt=mat(0xe8846a,{roughness:.72}), shirtD=mat(0xd06f58,{roughness:.72}), cream=mat(0xf6efe0,{roughness:.8}),
      pants=mat(0xb98d5f,{roughness:.85}), pantsD=mat(0xa0784e,{roughness:.85}), hair=mat(0x7a4b2e,{roughness:.9}), dark=mat(0x2c2522,{roughness:.35}), white=mat(0xffffff,{roughness:.3}),
      straw=mat(0xe6c97f,{roughness:.92}), strawD=mat(0xcbab5f,{roughness:.92}), canvasM=mat(0x8d7c5e,{roughness:.95}), canvasD=mat(0x74654a,{roughness:.95}),
      leather=mat(0x6e4a30,{roughness:.7}), lip=mat(0x9c4a3c,{roughness:.6}), brass=mat(0xd9b45a,{roughness:.35,metalness:.6}),
      blush=new THREE.MeshBasicMaterial({color:col(0xf08a7a),transparent:true,opacity:.32,depthWrite:false});
  function seg(parent,x,y,len,r1,r2,m){var piv=new THREE.Group();piv.position.set(x,y,0);parent.add(piv);add(piv,new THREE.CylinderGeometry(r1,r2,len,14),m,0,-len/2,0);add(piv,new THREE.SphereGeometry(r2,12,10),m,0,-len,0);return piv}
  function leg(s){var th=seg(g,s*.15,1.62,.74,.115,.097,pants), kn=seg(th,0,-.74,.5,.097,.09,pants);
    add(kn,new THREE.CylinderGeometry(.103,.103,.08,14),pantsD,0,-.5,0);
    add(kn,new THREE.CylinderGeometry(.06,.052,.24,12),skin,0,-.64,0);
    var ft=add(kn,new THREE.SphereGeometry(.085,12,10),skin,0,-.775,.07);ft.scale.set(1,.55,1.9);
    add(kn,new THREE.BoxGeometry(.19,.035,.38),leather,0,-.815,.07);add(kn,new THREE.BoxGeometry(.2,.03,.05),leather,0,-.745,.12);
    return {hip:th,knee:kn}}
  var LL=leg(1), LR=leg(-1);
  var hip=add(up,new THREE.SphereGeometry(.34,20,16),pants,0,1.66,0);hip.scale.set(1,.72,.84);
  var belt=add(up,new THREE.CylinderGeometry(.325,.335,.07,24),leather,0,1.74,0);belt.scale.z=.84;add(up,new THREE.BoxGeometry(.09,.075,.03),brass,0,1.74,.275);
  var prof=[[0,0],[.3,0],[.365,.18],[.355,.45],[.3,.72],[.22,.9],[.1,.98],[0,1]].map(function(p){return new THREE.Vector2(p[0],p[1])});
  var torso=add(up,new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(32),28),shirt,0,1.6,0);torso.scale.z=.82;
  [1.94,2.04].forEach(function(y){var b=add(up,new THREE.CylinderGeometry(.364,.368,.045,28,1,true),cream,0,y,0);b.scale.z=.82});
  var collar=add(up,new THREE.TorusGeometry(.13,.036,10,22),cream,0,2.57,0);collar.rotation.x=Math.PI/2;collar.scale.set(1,.85,1);
  for(var bi=0;bi<3;bi++)add(up,new THREE.SphereGeometry(.022,8,6),cream,0,2.16+bi*.13,.268-bi*.035);
  var strap=add(up,new THREE.TorusGeometry(.43,.024,8,30),canvasD,0,2.1,0);strap.rotation.set(0,Math.PI/2,.55,'ZYX');strap.scale.set(.82,1.12,1);
  var bag=new THREE.Group();bag.position.set(.35,1.64,.07);bag.rotation.z=-.12;up.add(bag);
  add(bag,new THREE.BoxGeometry(.38,.3,.16),canvasM,0,0,0);add(bag,new THREE.BoxGeometry(.4,.14,.18),canvasD,0,.09,0);add(bag,new THREE.BoxGeometry(.05,.05,.02),brass,0,.02,.095);
  var roll=add(bag,new THREE.CylinderGeometry(.035,.035,.3,10),cream,.08,.2,-.02);roll.rotation.z=-.3;
  add(up,new THREE.CylinderGeometry(.085,.1,.18,14),skin,0,2.66,0);
  // 머리는 목 위에서 따로 돈다
  var head=new THREE.Group();head.position.set(0,2.72,0);up.add(head);
  var hd=add(head,new THREE.SphereGeometry(.36,30,22),skin,0,.33,0);hd.scale.y=1.12;
  var glints=[];
  [1,-1].forEach(function(s){add(head,new THREE.SphereGeometry(.07,12,10),skin,s*.355,.3,0);add(head,new THREE.SphereGeometry(.1,12,10),hair,s*.3,.44,.1).scale.set(.7,1.2,1);
    var br=add(head,new THREE.BoxGeometry(.1,.022,.03),hair,s*.125,.48,.325);br.rotation.z=-s*.03;
    var ch=add(head,new THREE.CircleGeometry(.06,16),blush,s*.215,.26,.3);ch.rotation.y=s*.62;ch.userData.noShadow=true;
    glints.push(add(head,new THREE.SphereGeometry(.013,6,6),white,s*.125+.014,.39,.362))});
  var hr=add(head,new THREE.SphereGeometry(.378,24,16,0,Math.PI*2,0,Math.PI*.56),hair,0,.33,0);hr.scale.y=1.12;hr.rotation.x=-.5;
  add(head,new THREE.SphereGeometry(.2,14,12),hair,0,.2,-.24).scale.set(1.35,1,.8);
  var eyes=[.125,-.125].map(function(x){var e=add(head,new THREE.SphereGeometry(.04,12,10),dark,x,.37,.335);e.scale.set(1,1.4,.6);return e});
  add(head,new THREE.SphereGeometry(.052,12,10),skin,0,.28,.37);
  // 무표정: 짧고 곧은 일자 입
  var mouth=add(head,new THREE.CylinderGeometry(.012,.012,.085,8),lip,0,.16,.33);mouth.rotation.z=Math.PI/2;
  var hat=new THREE.Group();hat.position.set(0,.58,0);hat.rotation.x=-.13;head.add(hat);
  add(hat,new THREE.CylinderGeometry(.64,.68,.05,32),straw,0,.05,0);var rim=add(hat,new THREE.TorusGeometry(.675,.022,8,36),strawD,0,.04,0);rim.rotation.x=Math.PI/2;
  add(hat,new THREE.CylinderGeometry(.31,.37,.26,28),straw,0,.2,0);
  [.26,.31].forEach(function(y,i){var r=add(hat,new THREE.TorusGeometry(.325-i*.012,.012,6,28),strawD,0,y,0);r.rotation.x=Math.PI/2});
  [.3,.42,.54].forEach(function(r0){var r=add(hat,new THREE.TorusGeometry(r0+.06,.008,6,32),strawD,0,.078,0);r.rotation.x=Math.PI/2});
  var cap=add(hat,new THREE.SphereGeometry(.31,22,10),straw,0,.33,0);cap.scale.y=.3;add(hat,new THREE.CylinderGeometry(.375,.378,.07,28),shirt,0,.11,0);
  function arm(s){var ua=seg(up,s*.37,2.44,.5,.075,.066,skin);ua.rotation.z=s*.13;
    var sl=add(ua,new THREE.SphereGeometry(.15,16,12),shirt,0,-.06,0);sl.scale.y=1.25;add(ua,new THREE.CylinderGeometry(.093,.097,.06,14),shirtD,0,-.2,0);
    var fa=seg(ua,0,-.5,.46,.066,.056,skin);var hn=add(fa,new THREE.SphereGeometry(.085,12,10),skin,0,-.53,0);hn.scale.set(.8,1.2,1);add(fa,new THREE.SphereGeometry(.032,8,6),skin,-s*.05,-.5,.06);
    return {sh:ua,el:fa}}
  var AL=arm(1), AR=arm(-1);
  g.scale.setScalar(.8);
  return {bag:bag,strap:strap,group:g,up:up,head:head,eyes:eyes,glints:glints,legL:LL.hip,kneeL:LL.knee,legR:LR.hip,kneeR:LR.knee,armL:AL.sh,elbL:AL.el,armR:AR.sh,elbR:AR.el};
}
function easeX(o,v,k){o.rotation.x+=(v-o.rotation.x)*k}

// ---------- 바위, 수풀, 게, 갈매기 ----------
function wrapA(a){a=(a+Math.PI)%6.2832;if(a<0)a+=6.2832;return a-Math.PI}
function hash3(x,y,z,s){var h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,1274126177)+Math.imul(s,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296}
function vn3(x,y,z,s){var ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=sm(x-ix),fy=sm(y-iy),fz=sm(z-iz);
  function c(a,b,d){return hash3(ix+a,iy+b,iz+d,s)}
  return lerp(lerp(lerp(c(0,0,0),c(1,0,0),fx),lerp(c(0,1,0),c(1,1,0),fx),fy),lerp(lerp(c(0,0,1),c(1,0,1),fx),lerp(c(0,1,1),c(1,1,1),fx),fy),fz)}
// 구의 이음매에서 법선이 끊기지 않게 같은 자리의 법선을 평균 낸다
function weldNormals(g){var p=g.attributes.position,nm=g.attributes.normal,map={};
  for(var i=0;i<p.count;i++){var k=Math.round(p.getX(i)*1e4)+','+Math.round(p.getY(i)*1e4)+','+Math.round(p.getZ(i)*1e4);(map[k]=map[k]||[]).push(i)}
  for(var k2 in map){var a=map[k2];if(a.length<2)continue;var sx=0,sy=0,sz=0;
    for(var j=0;j<a.length;j++){sx+=nm.getX(a[j]);sy+=nm.getY(a[j]);sz+=nm.getZ(a[j])}
    var l=Math.hypot(sx,sy,sz)||1;for(var j2=0;j2<a.length;j2++)nm.setXYZ(a[j2],sx/l,sy/l,sz/l)}}
// 바위 모양: 둥근 덩어리에 굴곡을 겹치고, 몇 군데를 평평하게 깎아 쪼개진 면을 만든다
function rockGeo(seed,seg,sy){
  var g=new THREE.SphereGeometry(1,seg,Math.max(8,Math.round(seg*.7))),p=g.attributes.position,r=mulberry32(seed*7+3),cuts=[];
  for(var c=0;c<4;c++){var v=new V3(r()-.5,(r()-.25)*.9,r()-.5).normalize();cuts.push([v.x,v.y,v.z,0.7+r()*0.22])}
  var ax=0.85+r()*.4, az=0.85+r()*.4;
  for(var i=0;i<p.count;i++){var x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    var n=0.5*vn3(x*1.1+seed,y*1.1,z*1.1,seed)+0.3*vn3(x*2.6,y*2.6+seed,z*2.6,seed+1)+0.14*vn3(x*5.5,y*5.5,z*5.5+seed,seed+2)+0.06*vn3(x*12,y*12,z*12,seed+3);
    var f=0.74+0.52*n;
    for(var k=0;k<4;k++){var C=cuts[k],dd=x*C[0]+y*C[1]+z*C[2];if(dd>0.02)f=Math.min(f,C[3]/dd*(0.985+0.03*n))}
    var X=x*f*ax,Y=y*f,Z=z*f*az; if(Y<-0.3)Y=-0.3+(Y+0.3)*0.3;
    p.setXYZ(i,X,Y*sy,Z)}
  g.computeVertexNormals();weldNormals(g);return g;
}
// 바위 표면: 결, 반점, 갈라진 틈, 윗면의 이끼, 물에 닿는 아랫부분의 젖은 색과 따개비 띠
var rockU={uSea:{value:0},uRW:{value:0}};var terrWetU={value:0};
// 젖은 모래 높이: 방향(각도)마다 파도가 마지막으로 닿은 높이를 1줄짜리 텍스처에 담아 땅 셰이더가 직접 읽는다
var WETN=220,wetData=new Uint8Array(WETN*4),wetTex=new THREE.DataTexture(wetData,WETN,1,THREE.RGBAFormat);wetTex.magFilter=wetTex.minFilter=THREE.LinearFilter;wetTex.wrapS=THREE.RepeatWrapping;wetTex.needsUpdate=true;var wetTexU={value:wetTex};var causU={sea:{value:0},k:{value:1}};
function rockMat(hex,moss,wet){
  var m=mat(hex,{roughness:.9});
  m.onBeforeCompile=function(sh){sh.uniforms.uSea=rockU.uSea;sh.uniforms.uRW=rockU.uRW;sh.uniforms.uMoss={value:moss};sh.uniforms.uWetK={value:wet};
    sh.vertexShader='varying vec3 vRp;varying vec3 vRw;varying vec3 vRn;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRp=position;\n#ifdef USE_INSTANCING\nvRw=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;vRn=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*objectNormal);\n#else\nvRw=(modelMatrix*vec4(transformed,1.)).xyz;vRn=normalize(mat3(modelMatrix)*objectNormal);\n#endif');
    sh.fragmentShader=['varying vec3 vRp;varying vec3 vRw;varying vec3 vRn;uniform float uSea,uMoss,uWetK,uRW;',
      'float rh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}',
      'float rn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(rh(i),rh(i+vec3(1.,0.,0.)),f.x),mix(rh(i+vec3(0.,1.,0.)),rh(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(rh(i+vec3(0.,0.,1.)),rh(i+vec3(1.,0.,1.)),f.x),mix(rh(i+vec3(0.,1.,1.)),rh(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}',
      'float rf(vec3 p){return rn(p)*.5+rn(p*2.03+5.)*.3+rn(p*4.1+9.)*.2;}',''].join('\n')+
      sh.fragmentShader.replace('#include <color_fragment>',['#include <color_fragment>',
      'vec3 rq=vRp*2.2;float rn1=rf(rq),rn2=rn(rq*6.),rn3=rn(rq*17.);vec3 rc=diffuseColor.rgb;',
      'rc*=0.8+0.3*rn1;',
      'rc=mix(rc,rc*vec3(1.1,1.0,.86),smoothstep(.55,.8,rn(rq*.7+3.))*.55);',
      'rc*=1.-0.08*smoothstep(.55,1.,sin(vRp.y*10.+rn1*5.));',
      'rc*=mix(.6,1.,smoothstep(.2,.42,rn1));',
      'rc*=1.-0.2*step(.84,rn3)*rn2;rc=mix(rc,rc*1.3+.02,step(.94,rn3)*.55);',
      'float rMs=uMoss*smoothstep(.4,.85,vRn.y+(rn1-.5)*.7)*smoothstep(.3,.55,rn(rq*1.4+11.));',
      'rc=mix(rc,vec3(.13,.27,.06)*(0.7+0.6*rn2),rMs);',
      'float rWl=uSea+0.24,rWet=uWetK*(1.-smoothstep(rWl-0.22,rWl+0.1,vRw.y+(rn1-.5)*.2));',
      'rWet=max(rWet,uRW*.75);rc*=1.-0.32*rWet;',
      'rc=mix(rc,vec3(.11,.14,.08)*(0.7+0.6*rn3),uWetK*(1.-smoothstep(uSea-0.15,uSea+0.3,vRw.y+(rn2-.5)*.2))*smoothstep(.35,.65,rn2)*.75);',
      'diffuseColor.rgb=rc;'].join('\n'))
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.22,rWet)*(1.-0.2*rMs);')
      .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n{float be=.03;vec3 bq=vRp*7.;float b0=rf(bq),bx=rf(bq+vec3(be*7.,0.,0.)),by=rf(bq+vec3(0.,be*7.,0.)),bz=rf(bq+vec3(0.,0.,be*7.));normal=normalize(normal-mat3(viewMatrix)*vec3(bx-b0,by-b0,bz-b0)*(1.1-rWet*.5));}')};
  return m;
}
// 수풀 잎: 가운데 잎맥이 살짝 솟고 끝이 처지는 작은 잎
var LEAF=(function(){var pos=[],cl=[],idx=[],rows=5,L=.36,Wd=.14;
  for(var r=0;r<=rows;r++){var s=r/rows,w=Wd*Math.pow(Math.sin(Math.PI*(0.04+0.92*s)),0.8),y=-0.09*s*s,z=L*s;
    for(var a=-1;a<=1;a++){pos.push(a*w,y+(a===0?0.012:-0.02*w/Wd),z);var c=(0.6+0.48*s)*(a===0?1.1:1);cl.push(c,c,c)}}
  for(var r2=0;r2<rows;r2++)for(var c2=0;c2<2;c2++){var i=r2*3+c2;idx.push(i,i+3,i+1,i+1,i+3,i+4)}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));g.setIndex(idx);g.computeVertexNormals();return g})();
var LEAF_MAT=(function(){var m=mat(0xffffff,{roughness:.55,side:THREE.DoubleSide,vertexColors:true});
  m.onBeforeCompile=function(sh){sh.uniforms.uWT=windU;
    sh.vertexShader='uniform float uWT;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\ntransformed.x+=sin(uWT*2.3+instanceMatrix[3].x*1.7+instanceMatrix[3].z*1.3)*.03*position.z/.36;\ntransformed.y+=sin(uWT*1.9+instanceMatrix[3].z*2.1)*.02*position.z/.36;\n#endif')};
  return windify(m,'leaf')})();

// 게: 둥근 등딱지, 눈자루, 집게발 둘, 마디 있는 다리 여섯
var CRAB_PAL=[[0xd8412c,0xe8623f,0xa92e1d,0xf1cfb2],[0xe2703a,0xf08a50,0xb5532a,0xf4d8bc],[0x9e2f2a,0xb84238,0x6f1e1b,0xe7c3ad],[0xd9b98a,0xe8cfa6,0xa98a5f,0xf3e6d0],[0xa8364f,0xc04a63,0x7a2238,0xeccbc0]];
function makeCrab(pal,sc){
  var CR={red:mat(pal[0],{roughness:.42}),redL:mat(pal[1],{roughness:.42}),redD:mat(pal[2],{roughness:.5}),cream:mat(pal[3],{roughness:.6}),blk:mat(0x161412,{roughness:.15}),wht:mat(0xffffff,{roughness:.2})};
  var g=new THREE.Group(),b=new THREE.Group();g.add(b);b.position.y=.2;
  var sh=add(b,new THREE.SphereGeometry(.3,28,18),CR.red,0,.02,0);sh.scale.set(1,.42,.78);
  var bl=add(b,new THREE.SphereGeometry(.28,24,12),CR.cream,0,-.025,0);bl.scale.set(1,.3,.74);
  [.085,-.085].forEach(function(x){add(b,new THREE.SphereGeometry(.075,14,10),CR.redL,x,.095,.0).scale.set(1,.42,1.1)});
  for(var i=-2;i<=2;i++)add(b,new THREE.SphereGeometry(.028,8,6),CR.redD,i*.06,.06,.225-Math.abs(i)*.014);
  [1,-1].forEach(function(s){var st=add(b,new THREE.CylinderGeometry(.015,.02,.12,8),CR.red,s*.06,.13,.19);st.rotation.x=.3;
    add(b,new THREE.SphereGeometry(.032,12,10),CR.blk,s*.06,.195,.21);add(b,new THREE.SphereGeometry(.009,6,6),CR.wht,s*.07,.21,.235)});
  var claws=[],legs=[];
  [1,-1].forEach(function(s){
    var arm=new THREE.Group();arm.position.set(s*.2,0,.17);arm.rotation.y=s*.55;b.add(arm);
    var ag=new THREE.CylinderGeometry(.035,.042,.17,10);ag.rotateX(Math.PI/2);ag.translate(0,0,.08);add(arm,ag,CR.red,0,0,0);
    var cw=new THREE.Group();cw.position.z=.16;cw.rotation.y=-s*.7;arm.add(cw);
    add(cw,new THREE.SphereGeometry(.075,16,12),CR.red,0,0,.06).scale.set(.85,.68,1.3);
    var fg=new THREE.ConeGeometry(.028,.13,8);fg.rotateX(Math.PI/2);add(cw,fg,CR.redD,s*.015,-.015,.18);
    var mvf=new THREE.Group();mvf.position.set(0,.02,.12);cw.add(mvf);var mg=new THREE.ConeGeometry(.024,.12,8);mg.rotateX(Math.PI/2);mg.translate(0,0,.05);add(mvf,mg,CR.redD,0,0,0);
    claws.push({arm:arm,f:mvf,s:s});
    for(var li=0;li<3;li++){var H=new THREE.Group();H.position.set(s*.24,0,.07-li*.1);b.add(H);
      var g1=new THREE.CylinderGeometry(.02,.024,.2,8);g1.translate(0,.1,0);add(H,g1,CR.red,0,0,0);
      var K=new THREE.Group();K.position.y=.2;K.rotation.z=-s*1.47;H.add(K);
      var g2=new THREE.CylinderGeometry(.007,.019,.3,8);g2.translate(0,.15,0);add(K,g2,CR.redD,0,0,0);
      legs.push({H:H,s:s,base:s*(li-1)*.4,ph:li*2.1+(s>0?0:Math.PI)})}
  });
  g.scale.setScalar(sc);
  return {g:g,b:b,claws:claws,legs:legs};
}

// 갈매기: 흰 몸, 회색 등과 날개, 검은 날개 끝, 노란 부리의 붉은 점
var GM=null,WG=null;
function makeGull(v){
  if(!GM)GM={white:mat(0xf6f5f0,{roughness:.75}),dark:mat(0x25272b,{roughness:.6}),beak:mat(0xf0bf3a,{roughness:.4}),spot:mat(0xd2432c,{roughness:.4}),
    leg:mat(0xe8a466,{roughness:.6}),eye:mat(0x161616,{roughness:.2}),wingG:mat(0xa3afb8,{roughness:.7,side:THREE.DoubleSide}),wingD:mat(0x25272b,{roughness:.6,side:THREE.DoubleSide})};
  if(!WG){var sh=function(pts){var s=new THREE.Shape();s.moveTo(pts[0][0],pts[0][1]);for(var i=1;i<pts.length;i++)s.lineTo(pts[i][0],pts[i][1]);
      var g=new THREE.ExtrudeGeometry(s,{depth:.018,bevelEnabled:true,bevelThickness:.007,bevelSize:.007,bevelSegments:1});g.rotateX(Math.PI/2);g.translate(0,.009,0);g.computeVertexNormals();return g};
    WG={inner:sh([[0,.12],[.2,.135],[.42,.105],[.52,.075],[.52,-.095],[.3,-.12],[0,-.14]]),outer:sh([[0,.075],[.18,.07],[.3,.05],[.3,-.075],[.12,-.09],[0,-.095]]),
        tip:sh([[0,.05],[.14,.03],[.3,-.02],[.33,-.045],[.14,-.065],[0,-.075]])}}
  var M={},g=new THREE.Group(),body=new THREE.Group();for(var mk in GM)M[mk]=GM[mk];M.grey=mat(v.back,{roughness:.7});M.wingG=mat(v.back,{roughness:.7,side:THREE.DoubleSide});if(v.beak)M.beak=mat(v.beak,{roughness:.4});
  g.add(body);body.position.y=.29;g.rotation.order='YXZ';
  add(body,new THREE.SphereGeometry(.16,24,16),M.white,0,0,0).scale.set(1,.95,2.1);
  add(body,new THREE.SphereGeometry(.162,24,12,0,Math.PI*2,0,Math.PI*.42),M.grey,0,.014,-.03).scale.set(1.02,1,1.95);
  add(body,new THREE.SphereGeometry(.11,16,12),M.white,0,.08,.24);
  var head=new THREE.Group();head.position.set(0,.15,.32);head.rotation.order='YXZ';body.add(head);
  add(head,new THREE.SphereGeometry(.1,20,16),M.white,0,0,0).scale.set(.92,1,1.12);
  var bk=new THREE.ConeGeometry(.03,.15,12);bk.rotateX(Math.PI/2);add(head,bk,M.beak,0,-.015,.16);
  add(head,new THREE.SphereGeometry(.014,8,6),M.spot,0,-.03,.17);
  var eyes=[];[1,-1].forEach(function(s){eyes.push(add(head,new THREE.SphereGeometry(.016,8,8),M.eye,s*.07,.03,.06))});
  var tg=new THREE.ConeGeometry(.11,.26,12);tg.rotateX(-Math.PI/2);add(body,tg,M.white,0,.02,-.42).scale.set(1,.28,1);
  var wings=[];
  [1,-1].forEach(function(s){var piv=new THREE.Group();piv.position.set(s*.12,.07,.05);piv.rotation.order='YZX';body.add(piv);
    var hold=new THREE.Group();hold.scale.x=s;piv.add(hold);add(hold,WG.inner,M.wingG,0,0,0);
    var elb=new THREE.Group();elb.position.set(.5,0,-.01);hold.add(elb);add(elb,WG.outer,M.wingG,0,0,0);add(elb,WG.tip,M.wingD,.29,0,0);
    wings.push({piv:piv,hold:hold,elb:elb,s:s})});
  var fold=new THREE.Group();body.add(fold);
  [1,-1].forEach(function(s){var w=add(fold,new THREE.SphereGeometry(.105,16,12),M.grey,s*.12,.09,-.08);w.scale.set(.5,.5,2.3);w.rotation.x=-.08;
    var tc=new THREE.ConeGeometry(.045,.26,10);tc.rotateX(-Math.PI/2);add(fold,tc,M.dark,s*.075,.1,-.46)});
  var legs=[];
  [1,-1].forEach(function(s){var lg=new THREE.Group();lg.position.set(s*.05,-.13,.02);body.add(lg);
    add(lg,new THREE.CylinderGeometry(.014,.012,.16,8),M.leg,0,-.08,0);add(lg,new THREE.BoxGeometry(.07,.012,.09),M.leg,0,-.16,.03);legs.push(lg)});
  g.scale.setScalar(v.scale*.8); // 갈매기 크기: 처음 정한 것의 80%
  return {g:g,body:body,head:head,wings:wings,fold:fold,legs:legs,eyes:eyes};
}

function binOf(x,z){var a=Math.atan2(z,x);if(a<0)a+=6.2832;return Math.round(a/6.2832*W.N)%W.N}
function beachPt(a,h){var d=W.radiusAt(a)*(1-h/0.9*0.22);return {x:Math.cos(a)*d,z:Math.sin(a)*d}}

// 대피 날씨: 비·폭풍·센 바람이면 갈매기는 덤불 속으로, 게는 물속으로 숨는다. 경계에서 들락날락하지 않게 켜고 끄는 기준을 다르게 둔다
var SHELTER={on:false};
function shelterUpd(){var w=windStrU.value;SHELTER.on=SHELTER.on?!(WX.rain<.2&&WX.storm<.15&&w<.55):(WX.rain>.35||WX.storm>.3||w>.7);return SHELTER.on}
function updCrabs(dt,t,who){
  var shel=shelterUpd();
  for(var i=0;i<W.crabs.length;i++){var c=W.crabs[i],h=W.height(c.x,c.z),sw=W.swash[binOf(c.x,c.z)],dx=c.x-who.position.x,dz=c.z-who.position.z,d=Math.hypot(dx,dz)||.01,spd=0,C0=c.m;
    // 숨기: 바다 쪽으로 종종걸음쳐 물속으로 들어가고, 물이 깊어지면 보이지 않는다. 날씨가 풀리면 저마다 다른 때에 물에서 걸어 나온다
    if(shel&&c.mode!=='hide'&&c.mode!=='hidden'){var hp=beachPt(Math.atan2(c.z,c.x)+(Math.random()-.5)*.15,W.sea-.35-Math.random()*.2);c.tx=hp.x;c.tz=hp.z;c.mode='hide'}
    if(!shel&&c.mode==='hidden'){c.et=(c.et===undefined?2+Math.random()*14:c.et-dt);if(c.et<=0){c.et=undefined;C0.g.visible=true;var ep=beachPt(Math.atan2(c.z,c.x)+(Math.random()-.5)*.2,.45+Math.random()*.35);c.tx=ep.x;c.tz=ep.z;c.mode='emerge'}}
    if(c.mode==='hidden')continue;
    if(c.mode==='hide'&&Math.max(W.sea,sw)-h>.3){c.mode='hidden';C0.g.visible=false;continue}
    var busy=c.mode==='hide'||c.mode==='emerge';
    // 따라다니기: 앞장선 게에 딱 붙지 않는다. 멈춰서 한동안 제 할 일을 하다가 가끔 그 둘레 아무 데로 옮겨 가고,
    // 제 거리(leash)보다 멀어지면 쫓아간다(많이 떨어졌으면 종종걸음). 앞장선 게가 달아나면 함께 달아난다
    if(c.par&&!busy){var PA=c.par,pd=Math.hypot(PA.x-c.x,PA.z-c.z),fr=c.fr||.4,lsh=c.leash||1.2;c.ft-=dt;
      if(PA.mode!=='hidden'){
        if(PA.mode==='run'&&pd>fr*.6){var ra=Math.atan2(c.z-PA.z,c.x-PA.x);c.tx=PA.x+Math.cos(ra)*fr*.8;c.tz=PA.z+Math.sin(ra)*fr*.8;c.mode='run'}
        else if(pd>lsh&&c.mode==='idle'){c.ft=1+Math.random()*3;var fo=Math.random()*6.283,fr2=Math.max(.22,fr*(.4+Math.random()*.7));c.tx=PA.x+Math.cos(fo)*fr2;c.tz=PA.z+Math.sin(fo)*fr2;c.mode=pd>lsh*1.8?'run':'walk'}
        else if(c.mode==='idle'&&c.ft<=0){c.ft=1.5+Math.random()*5;
          if(Math.random()<.55){var fo2=Math.random()*6.283,fr3=Math.max(.22,fr*(.4+Math.random()*.9));c.tx=PA.x+Math.cos(fo2)*fr3;c.tz=PA.z+Math.sin(fo2)*fr3;c.mode='walk'}}}
      busy=true}
    if(busy){}
    else if(d<3.4){c.tx=c.x+dx/d*3;c.tz=c.z+dz/d*3;var ht=W.height(c.tx,c.tz);
      if(ht>0.9||ht<sw+0.08){var bp=beachPt(Math.atan2(c.tz,c.tx),clamp(ht,Math.min(0.8,sw+0.15),0.85));c.tx=bp.x;c.tz=bp.z}if(c.mode!=='run')sfx('crab',c.x,h,c.z,.35,null,1.2);c.mode='run'}
    else if(sw>h-0.03&&c.mode!=='run'){var bp2=beachPt(Math.atan2(c.z,c.x),Math.min(0.85,sw+0.3));c.tx=bp2.x;c.tz=bp2.z;c.mode='run'}
    if(c.mode==='idle'&&!c.par){c.timer-=dt;if(c.timer<=0){var bp3=beachPt(Math.atan2(c.z,c.x)+(Math.random()-.5)*.25,0.4+Math.random()*.45);c.tx=bp3.x;c.tz=bp3.z;c.mode='walk'}}
    if(c.mode!=='idle'){var mx=c.tx-c.x,mz=c.tz-c.z,ml=Math.hypot(mx,mz),sk=Math.sqrt(clamp((c.sc||.265)/.265,.2,1.5));spd=(c.mode==='run'?3.4:c.mode==='hide'?1.6:0.9)*sk;
      if(ml<(c.par?.04:.08)){if(c.mode==='hide'){c.mode='hidden';C0.g.visible=false;continue}c.mode='idle';c.timer=2+Math.random()*7;spd=0}
      else{var st=Math.min(ml,spd*dt);mx/=ml;mz/=ml;c.x+=mx*st;c.z+=mz*st;
        var want=Math.atan2(-mz,mx),alt=want+Math.PI;if(Math.abs(wrapA(alt-c.yaw))<Math.abs(wrapA(want-c.yaw)))want=alt;
        c.yaw+=wrapA(want-c.yaw)*Math.min(1,dt*6)}}
    var m=spd>0?1:0;c.wp+=dt*spd*16*clamp(.265/(c.sc||.265),.6,3.2);
    var C=c.m;C.g.position.set(c.x,W.height(c.x,c.z),c.z);C.g.rotation.y=c.yaw;C.b.position.y=.2+Math.abs(Math.sin(c.wp))*.012*m;
    for(var l=0;l<C.legs.length;l++){var L=C.legs[l],ph=c.wp+L.ph;L.H.rotation.set(0,L.base+Math.sin(ph)*.32*m,-L.s*(1.15-Math.max(0,Math.sin(ph+1.57))*.3*m))}
    var up=c.mode==='run'||c.mode==='hide'?1:0;c.cl+=(up-c.cl)*Math.min(1,dt*6);
    for(var q=0;q<2;q++){var K=C.claws[q];K.arm.rotation.x=-.15-c.cl*.7+Math.sin(t*1.3+i+q)*.05;K.f.rotation.x=-.25-.25*Math.max(0,Math.sin(t*(2+c.cl*6)+i*3+q))}
  }
}

function steer(b,tx,ty,tz,spd,turn,dt,vmax){
  var dx=tx-b.p.x,dz=tz-b.p.z,dh=Math.hypot(dx,dz)||.001,dy=ty-b.p.y;
  var yr=clamp(wrapA(Math.atan2(dx,dz)-b.yaw),-turn*dt,turn*dt);b.yaw+=yr;b.yawR=yr/Math.max(dt,1e-3);
  b.roll+=(clamp(-b.yawR*.4,-.75,.75)-b.roll)*Math.min(1,dt*3);
  var vm=vmax||spd*.7,vy=clamp(dy*1.2,-vm,vm);b.vy=vy;
  b.p.x+=Math.sin(b.yaw)*spd*dt;b.p.z+=Math.cos(b.yaw)*spd*dt;b.p.y+=vy*dt;
  b.pitch+=(-Math.atan2(vy,spd)*.7-b.pitch)*Math.min(1,dt*4);
  return dh;
}
function gullLandSpot(b,who,near){
  for(var k=0;k<12;k++){var x,z;
    if(near){var a=Math.random()*6.283,r=4.5+Math.random()*1.8;x=who.position.x+Math.cos(a)*r;z=who.position.z+Math.sin(a)*r;
      var h=W.height(x,z);if(h<W.swash[binOf(x,z)]+0.12||Math.hypot(x-W.fire.pos.x,z-W.fire.pos.z)<4.5)continue}
    else{var bp=beachPt(Math.atan2(b.p.z,b.p.x)+(Math.random()-.5)*1.2,0.45+Math.random()*.4);x=bp.x;z=bp.z;
      if(Math.hypot(x-who.position.x,z-who.position.z)<7)continue}
    return new V3(x,W.height(x,z),z)}
  var bq=beachPt(Math.random()*6.283,.7);return new V3(bq.x,W.height(bq.x,bq.z),bq.z);
}
// 비를 피할 자리: 사람에게서 떨어진 덤불 가운데 가까운 곳, 바람이 가려지는 쪽 잎 속. 덤불 하나에 두 마리까지
function gullShelterSpot(b,who){var B=W.bushes||[],best=-1,bd=1e9,wd=windDirU.value;
  for(var j=0;j<B.length;j++){var u=B[j],n=0;for(var k=0;k<W.gulls.length;k++){var o=W.gulls[k];if(o!==b&&o.shB===j&&(o.mode==='land'||o.mode==='rest'))n++}
    if(n>=2||Math.hypot(u.x-who.position.x,u.z-who.position.z)<5)continue;var dd=Math.hypot(u.x-b.p.x,u.z-b.p.z)+n*6;if(dd<bd){bd=dd;best=j}}
  if(best<0)return null;var u2=B[best],la=Math.atan2(wd.y,wd.x)+(Math.random()-.5)*1.2,rr=.85*u2.s*.55,x=u2.x+Math.cos(la)*rr,z=u2.z+Math.sin(la)*rr;
  b.shB=best;return new V3(x,W.height(x,z),z)}
function gullFly(b){b.shB=-1;b.shelt=false;b.mode='fly';b.orad=clamp(Math.hypot(b.p.x,b.p.z)+8,W.R*0.7,W.R*1.6);b.oa=Math.atan2(b.p.z,b.p.x);b.odir=Math.random()<.5?1:-1;b.alt=14+Math.random()*10;b.timer=(12+Math.random()*22)*(1+.6*GULL_ACT);b.ospd=6+Math.random()*1.5}
// 갈매기 활동성(0~1): 맑은 낮에는 1에 가까워 오래 날고 잠깐만 앉는다. 해가 낮거나 비·폭풍이 올수록 떨어져 오래 앉아 쉰다(밤에는 잔다)
var GULL_ACT=1;
function gullActivity(e){return smoothstep(.02,.3,e)*(1-clamp(WX.rain*1.5,0,1))*(1-.5*WX.storm)}
// 앉아 쉴 시간: 활동적이면 5~15초, 활동성이 떨어지면 30~80초. 둥지의 어미는 조금 더 오래 머문다
function gullRestT(b){var a=GULL_ACT,r=Math.random();return b.parent?lerp(60+r*40,14+r*16,a):lerp(30+r*50,5+r*10,a)}
// 날갯짓 한 번: 내리치기가 조금 길고(55%) 올리기는 짧다. 올릴 때는 손목을 접어 날개 끝이 처지고 뒤로 젖혀진다
var GD=6.2832*.55;
function flapU(u){u%=6.2832;return u<0?u+6.2832:u}
function flapE(u){u=flapU(u);return u<GD?Math.cos(Math.PI*u/GD):-Math.cos(Math.PI*(u-GD)/(6.2832-GD))}
function flapUp(u){u=flapU(u);return u<GD?0:Math.sin(Math.PI*(u-GD)/(6.2832-GD))}
function flapDn(u){u=flapU(u);return u<GD?Math.sin(Math.PI*u/GD):0}
var GP={wi:0,we:0,sw:0,wf:0,tw:0};
// 나는 중의 날개 자세. A는 날갯짓 세기(0이면 활공), br은 내려앉으며 날개를 세워 속도를 죽이는 정도
function gullFlapPose(b,t,i){
  var e=flapE(b.fp),up=flapUp(b.fp),dn=flapDn(b.fp),A=b.A,g=1-clamp(A/.7,0,1),br=b.br;
  GP.wi=.12+A*e+br*.45+g*Math.sin(t*1.3+i)*.03;
  GP.we=A*(.2*dn-.7*up)-.14*g-br*.1;
  GP.sw=A*.35*up+(.04+Math.abs(b.roll)*.15)*g-br*.25;
  GP.wf=A*.55*up+.05*g;
  GP.tw=A*(.18*dn-.12*up)-br*.35;
  return GP;
}
function gullPose(wi,we,sw,wf,tw){GP.wi=wi;GP.we=we;GP.sw=sw;GP.wf=wf;GP.tw=tw;return GP}
// 몸을 기준으로 한 점을 바라볼 때 고개를 돌릴 각(좌우)과 숙일 각(위아래)
var _gq=null,_gv=null;
function gullAim(b,M,x,y,z){
  if(!_gq){_gq=new THREE.Quaternion();_gv=new V3()}
  var sc=M.g.scale.x;_gv.set(x-b.p.x,y-b.p.y,z-b.p.z);_gq.setFromEuler(M.g.rotation).invert();_gv.applyQuaternion(_gq);
  _gv.y-=.44*sc;_gv.z-=.32*sc;
  b.hy=clamp(Math.atan2(_gv.x,_gv.z),-1.7,1.7);b.hp=clamp(Math.atan2(-_gv.y,Math.hypot(_gv.x,_gv.z)),-.7,1.05);
}
function updGulls(dt,t,who,e){
  var night=e<0.02,shel=shelterUpd(),wd=windDirU.value,wEff=windStrU.value,ga=GULL_ACT=gullActivity(e);
  for(var i=0;i<W.gulls.length;i++){var b=W.gulls[i],M=b.m,d=Math.hypot(b.p.x-who.position.x,b.p.z-who.position.z);
    var fT=0,lgT=0,brT=0,crT=0,bobY=0,P=null,hRate=5,wRate=25,wv=0;
    if(b.mode==='fly'||b.mode==='visit'){
      if(b.mode==='fly'){b.oa+=dt*b.ospd/b.orad*b.odir;steer(b,Math.cos(b.oa+.5*b.odir)*b.orad,b.alt+Math.sin(t*.3+i)*2,Math.sin(b.oa+.5*b.odir)*b.orad,b.ospd,1.2,dt);b.spd=b.ospd}
      else{b.oa+=dt*.75*b.odir;steer(b,who.position.x+Math.cos(b.oa+.6*b.odir)*b.vr,who.position.y+b.va,who.position.z+Math.sin(b.oa+.6*b.odir)*b.vr,5,2.2,dt);b.spd=5}
      var gy=Math.max(W.height(b.p.x,b.p.z),W.sea)+(b.mode==='visit'?3:6);if(b.p.y<gy)b.p.y+=(gy-b.p.y)*Math.min(1,dt*2);
      b.timer-=dt;
      if(b.timer<=0||night||shel){var r=Math.random();
        if(b.parent&&b.mode==='fly'){var pa=Math.random()*6.283,pr=.7+Math.random()*.4;b.mode='land';b.L=new V3(W.nest.x+Math.cos(pa)*pr,0,W.nest.z+Math.sin(pa)*pr);b.L.y=W.height(b.L.x,b.L.z);b.fleeR=4;b.lt=0}
        else if(shel&&!night){var sp0=gullShelterSpot(b,who);b.mode='land';b.L=sp0||gullLandSpot(b,who,false);b.shelt=!!sp0;b.fleeR=3;b.lt=0}
        // 한 바퀴 돈 뒤 내려앉을지: 맑은 낮에는 열에 하나쯤, 활동성이 떨어질수록 자주 앉는다
        else if(night||(b.mode==='fly'&&r<.1+.55*(1-ga))){b.mode='land';b.L=gullLandSpot(b,who,false);b.fleeR=4;b.lt=0}
        else if(b.mode==='visit'){if(r<.2+.4*(1-ga)){b.mode='land';b.L=gullLandSpot(b,who,true);b.fleeR=2.3;b.lt=0}else gullFly(b)}
        else if(r<.4){b.mode='visit';b.oa=Math.atan2(b.p.z-who.position.z,b.p.x-who.position.x);b.vr=5+Math.random()*2;b.va=5+Math.random()*2.5;b.timer=12+Math.random()*10}
        else b.timer=10+Math.random()*15}
      if(b.vy>.8||(b.tu||0)>.5)b.glide=false;b.gt-=dt;if(b.gt<=0){b.glide=!b.glide;b.gt=b.glide?1.5+Math.random()*2.5:.8+Math.random()*.9}
      b.A+=((b.glide?0:.7+.15*(b.tu||0))-b.A)*Math.min(1,dt*3);b.fp+=dt*(9.5+2*(b.tu||0));
      // 센 바람에 밀려 떠내려간다
      b.p.x+=wd.x*wEff*1.3*dt;b.p.z+=wd.y*wEff*1.3*dt;
      // 시선: 사람 곁을 맴돌 때는 사람을, 그 밖에는 가려는 쪽 아래 땅과 물을 훑어본다
      if(b.mode==='visit')gullAim(b,M,who.position.x,who.position.y+1.4,who.position.z);
      else{var la=b.yaw+clamp(b.yawR*.9,-1,1)+Math.sin(t*.37+i*1.7)*.55,ld=Math.max(6,(b.p.y-W.sea)*1.4),lx=b.p.x+Math.sin(la)*ld,lz=b.p.z+Math.cos(la)*ld;
        gullAim(b,M,lx,Math.max(W.height(lx,lz),W.sea),lz)}
      b.hr=-b.roll*.85;P=gullFlapPose(b,t,i);b.fl=false;b.lc=false;
    }else if(b.mode==='land'){
      b.lt+=dt;var ldx=b.L.x-b.p.x,ldz=b.L.z-b.p.z,dxh=Math.hypot(ldx,ldz);
      if(Math.hypot(b.L.x-who.position.x,b.L.z-who.position.z)<b.fleeR+.5){var sp1=b.shelt?gullShelterSpot(b,who):null;b.L=sp1||gullLandSpot(b,who,false);b.shelt=!!sp1;b.lt=0;b.fl=false;b.lc=false}
      var hh=b.p.y-b.L.y;
      if(!b.fl&&(dxh>1.8||hh>1.6)&&b.lt<30){
        // 너무 높거나 내려앉을 곳을 지나쳤으면, 그 위에서 작게 맴돌며 오르내리지 않고 둘레를 크게 돌며 고도를 낮춘 뒤 다시 들어온다
        var brg=Math.abs(wrapA(Math.atan2(ldx,ldz)-b.yaw));
        if(!b.lc&&(hh>dxh*.5+1.5||(dxh<5&&brg>1.3))){var rx=b.p.x-b.L.x,rz=b.p.z-b.L.z;b.lc=true;b.lct=0;b.ldir=rx*Math.cos(b.yaw)-rz*Math.sin(b.yaw)<0?-1:1}
        if(b.lc){b.lct+=dt;var ca=Math.atan2(b.p.z-b.L.z,b.p.x-b.L.x)+b.ldir*.6;
          b.spd+=(5.5-b.spd)*Math.min(1,dt*1.5);steer(b,b.L.x+Math.cos(ca)*6.5,b.L.y+2.5,b.L.z+Math.sin(ca)*6.5,b.spd,1.8,dt,1.4);
          if(b.lct>1.5&&hh<3.3&&Math.abs(dxh-6.5)<2)b.lc=false}
        else{b.spd+=(clamp(dxh*.8,1.6,6.5)-b.spd)*Math.min(1,dt*2);
          steer(b,b.L.x,b.L.y+.3+dxh*.35,b.L.z,b.spd,dxh<8?2.6:1.5,dt,Math.max(1,b.spd*.45))}
        var gy2=W.height(b.p.x,b.p.z)+.8;if(b.p.y<gy2)b.p.y+=(gy2-b.p.y)*Math.min(1,dt*6);
        var near4=clamp((4-dxh)/2.2,0,1);brT=near4*.6;lgT=near4;
        b.A+=(.6-.25*near4-b.A)*Math.min(1,dt*4);b.fp+=dt*(8+4*near4);b.pitch+=(-.35*near4-b.pitch)*Math.min(1,dt*3*near4);
      }else{
        // 마지막 한두 걸음: 날개를 세워 속도를 죽이며 그 자리로 곧장 내려앉는다
        b.fl=true;
        b.spd=Math.min(b.spd,Math.max(.35,dxh*1.5));var st=Math.min(dxh,b.spd*dt);
        if(dxh>1e-3){b.p.x+=ldx/dxh*st;b.p.z+=ldz/dxh*st}
        if(dxh>.2)b.yaw+=wrapA(Math.atan2(ldx,ldz)-b.yaw)*Math.min(1,dt*3);
        b.p.y+=clamp((b.L.y+dxh*.45-b.p.y)*Math.min(1,dt*4),-1.8*dt,1.8*dt);b.vy=0;
        b.pitch+=(-.45-b.pitch)*Math.min(1,dt*4);b.roll+=(0-b.roll)*Math.min(1,dt*4);
        brT=1;lgT=1;b.A+=(.35-b.A)*Math.min(1,dt*4);b.fp+=dt*14;
        if(dxh<.03&&b.p.y-b.L.y<.04){b.mode='rest';b.timer=gullRestT(b);b.walk=null;b.rt=0;b.at=.4+Math.random()*.6;b.act='look'}
      }
      if(dxh>.6)gullAim(b,M,b.L.x,b.L.y,b.L.z);else{b.hy=0;b.hp=.5}b.hr=-b.roll*.85;P=gullFlapPose(b,t,i);
    }else if(b.mode==='takeoff'){
      // 웅크렸다가 날개를 펴며 뛰어오르고, 첫 내리치기와 함께 떠오른다
      b.tt+=dt;b.yaw+=wrapA(b.ty-b.yaw)*Math.min(1,dt*6);b.roll+=(0-b.roll)*Math.min(1,dt*4);
      if(b.tt<.16){crT=1;lgT=1;b.pitch+=(.25-b.pitch)*Math.min(1,dt*10);b.A=0;P=gullPose(1.05,.1,-.05,0,-.1)}
      else{var tj=b.tt-.16,sp2=Math.min(7,1.4+tj*3.5);b.spd=sp2;b.p.x+=Math.sin(b.yaw)*sp2*dt;b.p.z+=Math.cos(b.yaw)*sp2*dt;b.p.y+=Math.max(.6,3.2-tj*1.2)*dt;
        b.pitch+=(-.35-b.pitch)*Math.min(1,dt*5);b.A=.95;b.fp+=dt*13;lgT=tj<.35?1:0;P=gullFlapPose(b,t,i)}
      var fx=b.p.x+Math.sin(b.yaw)*6,fz=b.p.z+Math.cos(b.yaw)*6;gullAim(b,M,fx,b.p.y+1,fz);b.hr=0;
      if(b.tt>2.3)gullFly(b);
    }else{
      // 쉬는 중: 두리번거리고, 사람을 지켜보고, 땅을 쪼고, 깃을 다듬고, 가끔 날개를 펴 본다. 몇 걸음 걷기도 한다
      b.rt+=dt;lgT=1;hRate=10;wRate=5;var gh=W.height(b.p.x,b.p.z),sw=W.swash[binOf(b.p.x,b.p.z)];
      fT=b.rt<.35?0:1;P=b.rt<.35?gullPose(.95,-.1,-.1,0,-.2):gullPose(0,0,0,0,0);
      b.pitch+=(0-b.pitch)*Math.min(1,dt*6);b.roll+=(0-b.roll)*Math.min(1,dt*6);
      var relo=shel&&!night&&!b.shelt&&!b.parent&&(b.relT=(b.relT===undefined?1+Math.random()*5:b.relT-dt))<=0;
      if(d<b.fleeR||sw>gh+.06||relo||(!night&&!shel&&(b.timer-=dt)<=0)){b.mode='takeoff';b.tt=0;b.fp=0;b.ty=d<b.fleeR?Math.atan2(b.p.x-who.position.x,b.p.z-who.position.z):b.yaw;b.fleeR=4;b.relT=undefined;b.shelt=false;b.shB=-1}
      else{
        var hunker=shel&&(b.shelt||b.parent||night);
        // 밤: 다리를 접고 앉아 고개를 등 깃털에 묻고 잔다. 사람이 6.5m 안으로 오면 고개를 들어 지켜보고, 멀어지면 몇 초 뒤 다시 잠든다
        if(night){if(d<6.5)b.alT=3+Math.random()*2;else b.alT=(b.alT||0)-dt;if(!b.tuckS)b.tuckS=Math.random()<.5?1:-1}
        // 덤불 속에서는 걷지 않고 바람 쪽을 바라본다
        if(hunker&&!b.walk)b.yaw+=wrapA(Math.atan2(-wd.x,-wd.y)-b.yaw)*Math.min(1,dt*.8);
        if(!b.walk&&(sw>gh-.04||(!hunker&&!night&&Math.random()<dt*.12))){var wa=Math.random()*6.283,wx=b.p.x+Math.cos(wa)*1.2,wz=b.p.z+Math.sin(wa)*1.2;
          if(sw>gh-.04){var bp4=beachPt(Math.atan2(b.p.z,b.p.x),Math.min(.85,sw+.3));wx=bp4.x;wz=bp4.z}
          if(W.height(wx,wz)>W.swash[binOf(wx,wz)]+.06){b.walk={x:wx,z:wz};b.act='walk';b.at=99}}
        if(b.walk){var mx=b.walk.x-b.p.x,mz=b.walk.z-b.p.z,ml=Math.hypot(mx,mz);
          if(ml<.06){b.walk=null;b.at=0}else{wv=1;var st2=Math.min(ml,.7*dt);b.p.x+=mx/ml*st2;b.p.z+=mz/ml*st2;b.yaw+=wrapA(Math.atan2(mx,mz)-b.yaw)*Math.min(1,dt*5)}}
        b.p.y+=(W.height(b.p.x,b.p.z)-b.p.y)*Math.min(1,dt*12);b.wp+=dt*wv*11;
        b.at-=dt;
        if(b.at<=0&&b.rt>.6){var r2=Math.random(),near=d<9&&!night;b.at=0;
          b.act=near&&r2<.45?'watch':r2<.62?'look':r2<.77?'peck':r2<.9?'preen':r2<.95?'stretch':'look';
          if(hunker)b.act=near&&r2<.5?'watch':'look';
          if(night){b.act=(b.alT||0)>0?'watch':'sleep';b.ad=b.at=.5}
          if(b.act==='look'){b.ty2=(Math.random()-.5)*2.6;b.tp2=(Math.random()-.5)*.6-.05;b.tr2=Math.random()<.3?(Math.random()-.5)*.9:0;b.ad=.6+Math.random()*2}
          else if(b.act==='watch'){b.tr2=Math.random()<.4?(Math.random()<.5?-.45:.45):0;b.ad=1.5+Math.random()*3}
          else if(b.act==='peck'){b.ty2=(Math.random()-.5)*.6;b.ad=.8+Math.random()*.6}
          else if(b.act==='preen'){b.side=Math.random()<.5?1:-1;b.ad=1.6+Math.random()*2}
          else b.ad=1.6;
          b.at=b.ad}
        var q=b.ad?1-b.at/b.ad:0,bpT=0;
        if(night&&!b.walk)b.act=(b.alT||0)>0?'watch':'sleep';
        if(b.act==='sleep'){b.hy=b.tuckS*2.55;b.hp=.38;b.hr=b.tuckS*.3;hRate=2.2}
        else if(b.act==='walk'){b.hy=0;b.hp=.25;b.hr=0}
        else if(b.act==='watch'){gullAim(b,M,who.position.x,who.position.y+1.4,who.position.z);b.hr=b.tr2}
        else if(b.act==='peck'){var pv=Math.pow(Math.sin(q*6.2832),2);b.hy=b.ty2;b.hp=.15+1.05*pv;b.hr=0;bpT=.38*pv}
        else if(b.act==='preen'){var pe=Math.sin(Math.PI*clamp(q*1.15,0,1));b.hy=b.side*2.4*pe;b.hp=.55*pe+Math.sin(t*11)*.06*pe;b.hr=b.side*.4*pe}
        else if(b.act==='stretch'){var se=smoothstep(.05,.3,q)*(1-smoothstep(.7,.95,q));fT=1-se;P=gullPose(1.1*se,.3*se,.05,0,-.1*se);b.hy=0;b.hp=-.25*se;b.hr=0}
        else{b.hy=b.ty2||0;b.hp=b.tp2||0;b.hr=b.tr2||0}
        b.pitch+=(bpT-b.pitch)*Math.min(1,dt*10);
        bobY=Math.abs(Math.sin(b.wp))*.02*wv;
      }
    }
    // 날개: 날 때의 자세를 부드럽게 따라가고, 앉으면 몸 옆으로 접어 넣는다
    var k=Math.min(1,dt*wRate);b.wi+=(P.wi-b.wi)*k;b.we+=(P.we-b.we)*k;b.sw+=(P.sw-b.sw)*k;b.wf+=(P.wf-b.wf)*k;b.tw+=(P.tw-b.tw)*k;
    b.f+=(fT-b.f)*Math.min(1,dt*(fT>b.f?4:10));b.br+=(brT-b.br)*Math.min(1,dt*4);b.lg+=(lgT-b.lg)*Math.min(1,dt*(lgT>b.lg?3:4));b.cr+=(crT-b.cr)*Math.min(1,dt*18);
    var f=b.f,o=1-f,ws=1-.5*f;
    for(var w=0;w<2;w++){var WW=M.wings[w];WW.piv.visible=f<.97;
      WW.piv.rotation.set(b.tw*o-1.3*f,WW.s*(b.sw*o+1.5*f),WW.s*b.wi*o);WW.hold.scale.set(WW.s*ws,1,ws);
      WW.elb.rotation.set(0,b.wf*o,b.we*o)}
    M.fold.visible=f>.8;
    // 다리: 날 때는 뒤로 접어 꼬리 밑에 붙이고, 내려앉을 때 앞으로 뻗는다
    var sitT=b.mode==='rest'&&night&&!b.walk?1:0,tuckT=sitT&&b.act==='sleep'?1:0;b.sitK=(b.sitK||0)+(sitT-(b.sitK||0))*Math.min(1,dt*(sitT?1.5:8));b.tuckK=(b.tuckK||0)+(tuckT-(b.tuckK||0))*Math.min(1,dt*(tuckT?1:5));
    var lr=b.mode==='rest'?lerp(Math.sin(b.wp)*.55*wv,1.45,b.sitK):lerp(1.35,b.mode==='land'?-.3:0,b.lg),lk=Math.min(1,dt*20);
    b.l0+=(lr-b.l0)*lk;b.l1+=((b.mode==='rest'?-lr:lr)-b.l1)*lk;M.legs[0].rotation.x=b.l0;M.legs[1].rotation.x=b.l1;
    // 움츠림: 비를 피할 때 몸을 낮추고 깃을 부풀리며 목을 집어넣는다
    b.hk=(b.hk||0)+(((b.mode==='rest'&&shel)?1:0)-(b.hk||0))*Math.min(1,dt*2);
    M.body.position.y=.29+bobY-b.cr*.06-(b.mode==='rest'?0:b.A*.025*flapE(b.fp))-.035*b.hk-.13*b.sitK+.005*Math.sin(t*1.5+i*2.1)*b.tuckK;M.body.scale.setScalar(1+Math.max(.07*b.hk,.08*b.sitK));
    M.head.position.y=.15-.05*b.hk-.04*b.tuckK;M.head.position.z=.32-.05*b.hk-.08*b.tuckK+(b.mode==='rest'?Math.sin(b.wp*2)*.025*wv:0);
    for(var ey=0;ey<M.eyes.length;ey++)M.eyes[ey].scale.y=1-.85*b.tuckK;
    // 휘청임: 바람이 셀수록, 그 자리에 돌풍이 지날수록 몸이 기우뚱하고 고도가 출렁이며 날개가 엇갈린다
    var air=b.mode==='fly'||b.mode==='visit'||(b.mode==='land'&&!b.fl)||(b.mode==='takeoff'&&b.tt>.5);
    var tuT=air?clamp(clamp((wEff-.3)/.7,0,1)*(.35+.65*windGustAt(b.p.x,b.p.z))+WX.storm*.25,0,1):0;b.tu=(b.tu||0)+(tuT-(b.tu||0))*Math.min(1,dt*2);
    var tu=b.tu,rO=tu*(.5*Math.sin(t*2.1+i*1.3)+.3*Math.sin(t*4.7+i*2.9)+.2*Math.sin(t*9.3+i)),pO=tu*.18*Math.sin(t*3.3+i*.7),yO=tu*.35*(Math.sin(t*1.7+i*2.2)+.5*Math.sin(t*4.1+i)),aW=tu*.22*Math.sin(t*5.3+i*1.9);
    if(tu>.01)for(var w2=0;w2<2;w2++)M.wings[w2].piv.rotation.z+=aW*o;
    var hk=Math.min(1,dt*hRate);b.hY+=(b.hy-b.hY)*hk;b.hP+=(b.hp-b.hP)*hk;b.hR+=(b.hr-b.hR)*hk;
    M.head.rotation.set(b.hP,b.hY,b.hR-rO*.8);
    M.g.position.set(b.p.x,b.p.y+yO,b.p.z);M.g.rotation.set(b.pitch+pO,b.yaw,b.roll+rO);
  }
}

var FIRE_ROCK=(function(){var g=rockGeo(7,18,.75);g.scale(.21,.21,.21);return g})();
// 고래: 먼바다에서 등을 두 번 드러내며 물을 뿜고, 꼬리를 세우며 잠수한다. 수염고래 모양. 길고 날씬한 몸, 납작하고 뾰족한 머리, 배에서 턱까지 이어지는 흰 주름, 등 뒤쪽의 작은 등지느러미
function makeWhale(){
  var g=new THREE.Group(),top=col(0x4a5d70),belly=col(0xe2e6e8),cc=new THREE.Color();
  var prof=[[0,0],[.35,.15],[.9,.9],[1.4,2.4],[1.75,4.5],[1.9,7],[1.85,9.5],[1.6,12],[1.2,14.5],[.75,16.8],[.42,18.8],[.28,20.5],[.22,22]].map(function(p){return new THREE.Vector2(p[0],p[1])});
  var lg=new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(60),48);lg.rotateX(Math.PI/2);lg.translate(0,0,-11);lg.rotateY(Math.PI);
  var p=lg.attributes.position,cl=new Float32Array(p.count*3);
  for(var i=0;i<p.count;i++){var x=p.getX(i),y=p.getY(i),z=p.getZ(i),ang=Math.atan2(y,Math.abs(x)),hd=smoothstep(5,11,z);
    y*=lerp(.84,.6,hd)*(y>0?1:1.05);if(z>8&&y>0)y*=1-.25*smoothstep(8,11,z);p.setY(i,y);
    var edge=-.18+.12*Math.sin(z*.7)+.08*Math.sin(z*2.3);var k=smoothstep(edge+.12,edge-.12,ang);
    cc.copy(top).lerp(belly,k*(z>-7?1:.25));
    if(k>.5&&z>-1.5&&z<11){var gv=.5+.5*Math.cos(Math.atan2(y,x)*52);cc.multiplyScalar(1-.22*smoothstep(.72,1,gv)*smoothstep(-1.5,1,z))}
    if(z>7.2&&Math.abs(ang+.06+(z-7.2)*.02)<.035)cc.multiplyScalar(.45);
    cc.multiplyScalar(.93+.07*vn3(x*2,y*2,z*1.3,7));cl[i*3]=cc.r;cl[i*3+1]=cc.g;cl[i*3+2]=cc.b}
  lg.setAttribute('color',new THREE.BufferAttribute(cl,3));lg.computeVertexNormals();
  var bendU={uBA:{value:0},uBP:{value:0},uCv:{value:0}},M=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:0});
  M.onBeforeCompile=function(sh){sh.uniforms.uBA=bendU.uBA;sh.uniforms.uBP=bendU.uBP;sh.uniforms.uCv=bendU.uCv;sh.vertexShader='uniform float uBA,uBP,uCv;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat bzt=max(0.,-position.z)/11.;transformed.y+=uBA*bzt*bzt*sin(uBP-position.z*.25)+.5*uCv*position.z*position.z;')};
  var D=mat(0x44576a,{roughness:.35}),Wt=mat(0xd8dde0,{roughness:.45}),E=mat(0x15191d,{roughness:.2});
  add(g,lg,M,0,0,0);
  var df=new THREE.Shape();df.moveTo(-.55,0);df.quadraticCurveTo(-.3,.35,.25,.75);df.quadraticCurveTo(.05,.3,.45,0);df.lineTo(-.55,0);
  var dg=new THREE.ExtrudeGeometry(df,{depth:.1,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:2});dg.rotateY(-Math.PI/2);dg.translate(.05,0,0);
  var dorsal=add(g,dg,D,0,.95,-6.6);dorsal.scale.setScalar(1.3);var fins=[];
  [1,-1].forEach(function(s){var pf=new THREE.Group();pf.position.set(s*1.3,-.65,5.2);pf.rotation.set(.1,s*.9,s*-.55);pf.userData.s=s;g.add(pf);fins.push(pf);
    var fm=add(pf,new THREE.SphereGeometry(1,20,10),D,s*1.2,0,0);fm.scale.set(1.3,.07,.3);
    add(g,new THREE.SphereGeometry(.07,10,8),E,s*1.12,.22,7.6)});
  var fluke=new THREE.Group();fluke.position.z=-11;g.add(fluke);
  var fs=new THREE.Shape();fs.moveTo(0,.2);fs.quadraticCurveTo(1.3,.15,2.9,-.9);fs.quadraticCurveTo(2.2,-1.1,1.1,-.95);fs.lineTo(0,-.7);fs.lineTo(-1.1,-.95);fs.quadraticCurveTo(-2.2,-1.1,-2.9,-.9);fs.quadraticCurveTo(-1.3,.15,0,.2);
  var fg=new THREE.ExtrudeGeometry(fs,{depth:.1,bevelEnabled:true,bevelThickness:.05,bevelSize:.05,bevelSegments:2});fg.rotateX(Math.PI/2);fg.translate(0,.05,0);
  add(fluke,fg,D,0,0,0);
  var NB=1600,bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NB*3),3));bg.setAttribute('a',new THREE.BufferAttribute(new Float32Array(NB),1));bg.setAttribute('s',new THREE.BufferAttribute(new Float32Array(NB),1));
  var bm=new THREE.ShaderMaterial({uniforms:{uL:{value:1}},transparent:true,depthWrite:false,
    vertexShader:'attribute float a;attribute float s;varying float vA;void main(){vA=a;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=s*320./-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform float uL;varying float vA;void main(){float r=length(gl_PointCoord-.5);float m=smoothstep(.5,0.,r);gl_FragColor=vec4(vec3(.94,.97,1.)*(.3+.7*uL),m*vA*.6);}'});
  var blow=new THREE.Points(bg,bm);blow.frustumCulled=false;blow.renderOrder=6;
  g.visible=false;
  return {g:g,fluke:fluke,blow:blow,dorsal:dorsal,fins:fins,bendU:bendU};
}
// 고래의 움직임: 몸이 지나간 길을 그대로 따라간다. 위아래 속도에서 몸의 기울기를, 기울기가 바뀌는 빠르기에서 몸이 휘는 정도를 얻는다.
// 위아래는 목표 깊이로 부드럽게 끌려가는 감쇠 운동이라 중간에 멈칫하지 않는다. 숨을 쉬러 2~4번 떠올라 머리부터 내밀며 물을 뿜고 등을 굴리듯 보인 뒤,
// 마지막에는 꼬리를 높이 세우며 깊이 잠수하거나, 깊이 내려갔다가 힘차게 차오르며 물 밖으로 솟구친다.
// 헤엄칠 때는 꼬리 쪽 몸통이 위아래로 물결치며, 꼬리지느러미가 그 박자에 맞춰 물을 찬다.
var WG_G=14, wTmp=new V3(), wTmp2=new V3();
function sprayEmit(Wh,pos,n,o){for(var k=0;k<n;k++){var P=Wh.pool[Wh.pi];Wh.pi=(Wh.pi+1)%Wh.NB;var a=Math.random()*6.283,r=Math.random()*(o.spread||1);
  P.p=pos.clone().add(new V3(Math.cos(a)*r,(o.dy||0)*Math.random(),Math.sin(a)*r));
  P.v=new V3(Math.cos(a)*(o.out||1)*(.3+Math.random())+(o.vx||0),(o.up||4)*(.45+Math.random()*.75),Math.sin(a)*(o.out||1)*(.3+Math.random())+(o.vz||0));
  P.l=-Math.random()*(o.delay||0);P.life=(o.life||2.5)*(.7+Math.random()*.5);P.s0=o.s0||.6;P.s1=o.s1||2.5;P.g=o.g===undefined?3.2:o.g;P.drag=o.drag||.9}}
// 몸의 휨: 꼬리 쪽 물결(amp, ph)과 지나온 길의 굽음(cv, 로컬 단위). 지느러미와 꼬리도 같은 높이와 기울기를 따른다
function whaleBend(Wh,amp,ph,cv){var U=Wh.m.bendU;U.uBA.value=amp;U.uBP.value=ph;U.uCv.value=cv;
  function off(z){var zt=Math.max(0,-z)/11;return amp*zt*zt*Math.sin(ph-z*.25)+.5*cv*z*z}
  var M=Wh.m,m=(off(-10.6)-off(-11))/.4;M.fluke.position.y=off(-11);M.fluke.rotation.x=-Math.atan(m)*1.3+(Wh.fu||0);M.dorsal.position.y=.95+off(-6.6)}
function whalePlan(){var P=[{k:'dive',d:1.5+Math.random()*1.5}],n=2+Math.floor(Math.random()*3);
  for(var i=0;i<n;i++){P.push({k:'surf',d:4.5+Math.random()*2.5});if(i<n-1)P.push({k:'dive',d:3+Math.random()*4})}
  if(Math.random()<.5)P.push({k:'fluke',d:14});else{P.push({k:'deep',d:4.5});P.push({k:'charge',d:99})}
  return P}
function updWhale(dt,t,who,light){
  var Wh=W.whale,M=Wh.m,G=M.g;
  // 물보라와 물방울 (돌고래와 발 첨벙도 같은 알갱이를 쓴다)
  var bp=M.blow.geometry.attributes;
  for(var q=0;q<Wh.NB;q++){var P=Wh.pool[q];if(P.l>=1||!P.p){bp.a.array[q]=0;continue}
    P.l+=dt/P.life;if(P.l<0){bp.a.array[q]=0;continue}P.v.y-=dt*P.g;P.v.multiplyScalar(1-dt*P.drag);P.p.addScaledVector(P.v,dt);
    if(P.p.y<W.sea-.2&&P.v.y<0)P.l=1;
    bp.position.array[q*3]=P.p.x;bp.position.array[q*3+1]=P.p.y;bp.position.array[q*3+2]=P.p.z;bp.a.array[q]=Math.pow(Math.max(0,1-P.l),1.3)*Math.min(1,P.l*8);bp.s.array[q]=P.s0+P.l*(P.s1-P.s0)}
  bp.position.needsUpdate=true;bp.a.needsUpdate=true;bp.s.needsUpdate=true;M.blow.material.uniforms.uL.value=light;
  // 물 위의 거품 고리
  var SU=waterU.uSplash.value;if(SU.w>0){SU.z+=dt*(2.5+SU.w*3);SU.w=Math.max(0,SU.w-dt*.16)}
  if(!Wh.active){
    // 아주 드물게: 섬에 들어오고 15~40분 뒤 처음, 그다음은 45~90분마다. 밤·폭풍이라 못 나온 때는 5~15분 뒤로 미룬다
    // (게임 시간 t는 오늘 06시부터 흐른 초라서, 처음 정한 값(45~75)으로는 들어오자마자 고래가 나왔다)
    if(!Wh.sched){Wh.sched=true;Wh.next=t+900+Math.random()*1500}
    if(t<Wh.next)return;
    if(light<.3||WX.storm>.6){Wh.next=t+300+Math.random()*600;return}
    // 섬 둘레 어디쯤, 물이 충분히 깊은 곳부터 먼바다까지 그때그때 다른 거리에서 옆으로 지나간다
    var a=Math.atan2(who.position.z,who.position.x)+(Math.random()-.5)*2.2,rr=W.radiusAt(a),dmin=rr*1.75,d0=Math.min(140,dmin+Math.random()*Math.max(15,140-dmin)),sg=Math.random()<.5?1:-1;
    Wh.sc=.8+Math.random()*.35;G.scale.setScalar(Wh.sc);
    Wh.plan=whalePlan();var tot=0;Wh.plan.forEach(function(Q){tot+=Math.min(Q.d,8)});
    Wh.h=new V3(-Math.sin(a)*sg,0,Math.cos(a)*sg);Wh.p=new V3(Math.cos(a)*d0,0,Math.sin(a)*d0).addScaledVector(Wh.h,-tot*2.2*(.3+Math.random()*.4));
    Wh.active=true;Wh.t=0;Wh.qi=0;Wh.qt=0;Wh.phase=Wh.plan[0].k;Wh.y=-4.6*Wh.sc;Wh.vy=0;Wh.vh=2.2;Wh.pitch=0;Wh.cv=0;Wh.roll=0;Wh.bp=0;Wh.fin=0;
    Wh.blown=false;Wh.crest=-.9*Wh.sc;Wh.ov=0;Wh.ow=0;Wh.fu=0;Wh.fUp=false;G.visible=true;toast('먼바다에 고래가 지나갑니다.',5)}
  Wh.t+=dt;Wh.qt+=dt;var T=Wh.t,sc=Wh.sc,amp=.3,rate=1.3,Q=Wh.plan[Wh.qi],yT=null,om=.75,vhT=2.2,owT=0,ovT=0,pPrev=Wh.pitch;
  if(Q&&Wh.qt>=Q.d&&Wh.qi<Wh.plan.length-1){Wh.qi++;Wh.qt=0;Q=Wh.plan[Wh.qi];Wh.phase=Q.k;Wh.blown=false}
  var ph=Wh.phase,qt=Wh.qt;
  if(ph==='dive'){yT=-4.6*sc;om=.7;amp=.35}
  else if(ph==='surf'){
    if(Q.crest===undefined)Q.crest=-(.75+Math.random()*.3)*sc;Wh.crest=Q.crest;yT=Q.crest;amp=.22;rate=1.1;
    // 숨구멍이 물 위로 나오는 순간 물을 뿜는다
    if(!Wh.blown){wTmp.set(0,1.25,7);G.localToWorld(wTmp);if(wTmp.y>W.sea-.1){Wh.blown=true;sprayEmit(Wh,wTmp,50,{spread:.25*sc,up:7*sc,out:.5,vx:.6,life:2.8,s0:.7*sc,s1:3.2*sc,g:3.2,drag:.9})}}}
  else if(ph==='fluke'){
    // 꼬리 세우며 잠수: 등을 크게 굽혀 머리부터 내려가면, 꼬리가 물 위로 높이 들렸다가 미끄러지듯 사라진다
    if(qt<1.2){yT=Wh.crest;amp=.18}
    else if(qt<4.8){yT=-9.7*sc;om=.9;owT=1;ovT=-1.2;vhT=1.4;amp=.08}
    else{yT=-24*sc;om=.6;owT=1;ovT=-1.42;vhT=.6;amp=.06}
    Wh.fu+=((qt>1.6&&qt<6?.35:0)-Wh.fu)*Math.min(1,dt*1.5);
    wTmp.set(0,0,-.6);M.fluke.localToWorld(wTmp);var up=wTmp.y>W.sea+.2;
    if(up&&Math.random()<dt*40){wTmp2.set((Math.random()-.5)*5,0,-.2-Math.random()*.8);M.fluke.localToWorld(wTmp2);sprayEmit(Wh,wTmp2,3,{spread:.1,up:.3,out:.15,life:1.6,s0:.35*sc,s1:.7*sc,g:9.8,drag:.2})}
    if(up!==Wh.fUp){wTmp.y=W.sea;sprayEmit(Wh,wTmp,up?24:40,{spread:1.6*sc,up:up?2.5:3.5,out:1.2,life:1.4,s0:.5*sc,s1:1.6*sc,g:9.8,drag:.5});Wh.fUp=up}
    if(qt>13.5){Wh.active=false;G.visible=false;Wh.next=t+2700+Math.random()*2700;return}}
  else if(ph==='deep'){yT=-11*sc;om=.8;vhT=2.8;amp=.5;rate=2}
  else if(ph==='charge'){
    // 깊은 곳에서 꼬리를 세차게 차며 거의 곧추서서 차오른다
    Wh.vy+=(14-Wh.vy)*Math.min(1,dt*1.3);vhT=4.5;amp=.8;rate=3.2;
    if(Wh.y>-1.8*sc){Wh.phase='air';Wh.ta=0;Wh.pa0=Wh.pitch;sfx('whale',Wh.p.x,0,Wh.p.z,.9,1,40);wTmp.copy(Wh.p);wTmp.y=W.sea;
      sprayEmit(Wh,wTmp,150,{spread:2.4*sc,up:8,out:2.6,life:2,s0:.7*sc,s1:2.6*sc,g:12,drag:.4});SU.set(Wh.p.x,Wh.p.z,1.8,.8)}}
  if(Wh.phase==='air'){
    // 솟구치기: 몸통 중심이 중력을 받으며 포물선을 그리고, 몸은 뒤로 비틀며 옆으로 쓰러진다
    Wh.ta+=dt;Wh.vy-=WG_G*dt;Wh.y+=Wh.vy*dt;Wh.p.addScaledVector(Wh.h,Wh.vh*dt);
    var s=smoothstep(.35,2.1,Wh.ta);Wh.pitch=Wh.pa0-(Wh.pa0+.05)*s;Wh.roll=1.75*smoothstep(.3,1.7,Wh.ta);Wh.fin=smoothstep(.2,.8,Wh.ta)*(1-smoothstep(1.6,2.2,Wh.ta));
    Wh.cv*=1-Math.min(1,dt*3);amp=Wh.y>-1?.12:.75;rate=Wh.y>-1?1.2:3.2;
    // 공중에 뜬 몸에서 물이 흘러내린다
    if(Wh.y>-1.5*sc&&Math.random()<dt*60){wTmp.set((Math.random()-.5)*1.6,(Math.random()-.5)*1.2,(Math.random()-.5)*16);G.localToWorld(wTmp);if(wTmp.y>W.sea+.3)sprayEmit(Wh,wTmp,3,{spread:.2,up:.6,out:.3,life:1.1,s0:.3*sc,s1:.6*sc,g:12,drag:.2})}
    if(Wh.vy<0&&Wh.y<-.6*sc){Wh.phase='sink';Wh.ts=0;sfx('whale',Wh.p.x,0,Wh.p.z,1,.85,40);
      // 떨어지는 큰 물보라: 옆으로 쓰러진 몸 길이를 따라 물벽이 솟고, 조금 늦게 가운데서 물기둥이 치솟으며, 물안개가 넓게 퍼진다
      for(var zz=-10;zz<=10;zz+=2){wTmp.set(0,0,zz);G.localToWorld(wTmp);wTmp.y=W.sea;sprayEmit(Wh,wTmp,30,{spread:1.4*sc,up:10*sc,out:3*sc,life:2.4,s0:.9*sc,s1:3.4*sc,g:11,drag:.35})}
      wTmp.copy(Wh.p);wTmp.y=W.sea;
      sprayEmit(Wh,wTmp,100,{spread:2*sc,up:17*sc,out:2,life:2.8,s0:1*sc,s1:3.8*sc,g:11,drag:.3,delay:.4});
      sprayEmit(Wh,wTmp,150,{spread:8*sc,up:4,out:7,life:3.8,s0:1.6*sc,s1:5.5*sc,g:2,drag:1.1,delay:.25});
      sprayEmit(Wh,wTmp,120,{spread:6*sc,up:6,out:5,life:1.8,s0:.5*sc,s1:1.2*sc,g:12,drag:.4,delay:.6});
      SU.set(Wh.p.x,Wh.p.z,3,1)}
  }else if(Wh.phase==='sink'){
    // 떨어진 뒤: 물의 저항으로 빠르게 느려지며 몸을 바로 하고 가라앉는다
    Wh.ts+=dt;Wh.vy*=Math.pow(.2,dt);Wh.y+=Wh.vy*dt-dt*.8;Wh.vh*=Math.pow(.6,dt);Wh.p.addScaledVector(Wh.h,(1.5+Wh.vh*.3)*dt);
    Wh.pitch+=(-.25-Wh.pitch)*Math.min(1,dt*1.2);Wh.roll+=(0-Wh.roll)*Math.min(1,dt*.7);Wh.fin*=1-Math.min(1,dt*2);Wh.cv*=1-Math.min(1,dt*3);amp=.25;
    if(Wh.ts>7){Wh.active=false;G.visible=false;Wh.next=t+2700+Math.random()*2700;return}
  }else{
    // 물속: 목표 깊이로 끌려가는 감쇠 운동. 몸은 지나가는 길의 기울기를 따르고, 꼬리 세우기 때는 정해진 기울기 쪽으로 넘어간다
    if(yT!==null)Wh.vy+=(om*om*(yT-Wh.y)-2*om*Wh.vy)*dt;Wh.y+=Wh.vy*dt;
    Wh.vh+=(vhT-Wh.vh)*Math.min(1,dt*.8);Wh.p.addScaledVector(Wh.h,Wh.vh*dt);
    Wh.ow+=(owT-Wh.ow)*Math.min(1,dt*1.1);Wh.ov+=(ovT-Wh.ov)*Math.min(1,dt*.9);
    var pT=lerp(Math.atan2(Wh.vy,Wh.vh),Wh.ov,Wh.ow);Wh.pitch+=(pT-Wh.pitch)*Math.min(1,dt*3);
    var cvR=clamp((Wh.pitch-pPrev)/Math.max(dt,1e-3)/Math.max(.8,Math.hypot(Wh.vh,Wh.vy)),-.025,.025);Wh.cv+=(cvR-Wh.cv)*Math.min(1,dt*3);
    Wh.roll+=(0-Wh.roll)*Math.min(1,dt);Wh.fin*=1-Math.min(1,dt*2);
  }
  Wh.bp+=dt*rate*Math.PI;whaleBend(Wh,amp,Wh.bp,Wh.cv*sc);
  G.position.set(Wh.p.x,W.sea+Wh.y,Wh.p.z);G.rotation.set(-Wh.pitch,Math.atan2(Wh.h.x,Wh.h.z),Wh.roll+Math.sin(T*.5)*.04,'YXZ');
  for(var f=0;f<2;f++){var FN=M.fins[f];FN.rotation.z=FN.userData.s*(-.55+Wh.fin*.7+Math.sin(T*1.1+f)*.05)}
}

// 돌고래: 큰돌고래 모양. 짧은 부리와 둥근 이마, 짙은 등과 회색 옆구리, 흰 배, 뒤로 휜 등지느러미
var DOL_G=null;
function makeDolphin(){
  if(!DOL_G){
    var prof=[[0,0],[.03,.02],[.045,.1],[.055,.17],[.1,.24],[.16,.33],[.205,.48],[.235,.7],[.24,.95],[.22,1.25],[.18,1.55],[.12,1.85],[.07,2.1],[.045,2.28],[.03,2.4]].map(function(q){return new THREE.Vector2(q[0],q[1])});
    var lg=new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(48),24);lg.rotateX(Math.PI/2);lg.translate(0,0,-1.2);lg.rotateY(Math.PI);
    var p=lg.attributes.position,cl=new Float32Array(p.count*3),cc=new THREE.Color(),cD=col(0x3a4652),cM=col(0x8592a0),cB=col(0xe4e9ec);
    for(var i=0;i<p.count;i++){var x=p.getX(i)*.9,y=p.getY(i),z=p.getZ(i);p.setX(i,x);if(y<0)p.setY(i,y*.88);
      var ang=Math.atan2(y,Math.abs(x)+1e-4),cape=.45-.3*smoothstep(-.3,.6,z)+.06*Math.sin(z*7);
      cc.copy(cM).lerp(cD,smoothstep(cape-.2,cape+.2,ang)).lerp(cB,smoothstep(-.2,-.55,ang)*smoothstep(-1.1,-.6,z));
      cc.multiplyScalar(.95+.05*vn3(x*9,y*9,z*5,3));cl[i*3]=cc.r;cl[i*3+1]=cc.g;cl[i*3+2]=cc.b}
    lg.setAttribute('color',new THREE.BufferAttribute(cl,3));lg.computeVertexNormals();
    var ds=new THREE.Shape();ds.moveTo(.17,0);ds.quadraticCurveTo(.05,.22,-.13,.3);ds.quadraticCurveTo(-.08,.12,-.22,0);ds.lineTo(.17,0);
    var dg=new THREE.ExtrudeGeometry(ds,{depth:.03,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:1});dg.rotateY(-Math.PI/2);dg.translate(.015,0,0);
    var fs=new THREE.Shape(),k=.11;fs.moveTo(0,.2*k);fs.quadraticCurveTo(1.3*k,.15*k,2.9*k,-.9*k);fs.quadraticCurveTo(2.2*k,-1.1*k,1.1*k,-.95*k);fs.lineTo(0,-.7*k);fs.lineTo(-1.1*k,-.95*k);fs.quadraticCurveTo(-2.2*k,-1.1*k,-2.9*k,-.9*k);fs.quadraticCurveTo(-1.3*k,.15*k,0,.2*k);
    var fg=new THREE.ExtrudeGeometry(fs,{depth:.02,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:1});fg.rotateX(Math.PI/2);fg.translate(0,.01,0);
    DOL_G={body:lg,dorsal:dg,fluke:fg,fin:new THREE.SphereGeometry(1,12,8),eye:new THREE.SphereGeometry(.018,8,6),D:mat(0x3a4652,{roughness:.32}),E:mat(0x101418,{roughness:.2})}}
  var G=DOL_G,g=new THREE.Group(),U={uBA:{value:0},uBP:{value:0},uCv:{value:0}},M=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.3,metalness:0});
  M.onBeforeCompile=function(sh){sh.uniforms.uBA=U.uBA;sh.uniforms.uBP=U.uBP;sh.uniforms.uCv=U.uCv;sh.vertexShader='uniform float uBA,uBP,uCv;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat bzt=max(0.,-position.z)/1.2;transformed.y+=uBA*bzt*bzt*sin(uBP-position.z*2.2)+.5*uCv*position.z*position.z;')};
  add(g,G.body,M,0,0,0);
  var dorsal=add(g,G.dorsal,G.D,0,.2,-.05);
  [1,-1].forEach(function(s){var f=add(g,G.fin,G.D,s*.2,-.1,.5);f.scale.set(.2,.022,.075);f.rotation.set(.15,s*.55,s*-.5);add(g,G.eye,G.E,s*.128,.03,.88)});
  var fluke=new THREE.Group();fluke.position.z=-1.2;g.add(fluke);add(fluke,G.fluke,G.D,0,0,0);
  g.rotation.order='YXZ';g.visible=false;
  return {g:g,U:U,fluke:fluke,dorsal:dorsal};
}
function dolphBend(D,amp,ph,cv){var M=D.m;M.U.uBA.value=amp;M.U.uBP.value=ph;M.U.uCv.value=cv;
  function off(z){var zt=Math.max(0,-z)/1.2;return amp*zt*zt*Math.sin(ph-z*2.2)+.5*cv*z*z}
  var m=(off(-1.15)-off(-1.2))/.05;M.fluke.position.y=off(-1.2);M.fluke.rotation.x=-Math.atan(m)*1.25;M.dorsal.position.y=.2+off(-.05)}
// 물 위로 나올 준비: roll은 등과 지느러미만 굴리듯 내미는 숨쉬기, leap은 몸 전체가 나오는 도약, high는 높은 도약(가끔 공중에서 몸을 돌린다)
function dolphRise(D,kind){D.st='rise';D.kind=kind;D.v0=kind==='roll'?1.3+Math.random()*.6:kind==='leap'?3.6+Math.random()*1.3:5.6+Math.random()*1.4;
  D.spinN=kind==='high'&&Math.random()<.35?(Math.random()<.7?1:2):0;D.spinR=0}
function dolphKind(){var r=Math.random();return r<.42?'roll':r<.88?'leap':'high'}
// 돌고래 떼: 섬 둘레 어디서든, 물가 가까이부터 먼바다까지 매번 다른 곳을 지나간다. 무리 전체가 천천히 굽은 길을 따라가고,
// 한 마리 한 마리는 제자리 근처에서 앞뒤 옆으로 조금씩 흔들리며 저마다의 박자로 물 위로 뛰어오른다. 짝을 지어 거의 함께 뛰는 녀석들도 있다
function updDolphins(dt,t,who,light){
  var S=W.dolph;if(!DOLPHS)return;
  if(!S.active){
    // 고래보다 자주: 섬에 들어오고 3~8분 뒤 처음, 그다음은 10~20분마다. 밤·폭풍이라 못 나온 때는 2~5분 뒤로 미룬다
    if(!S.sched){S.sched=true;S.next=t+180+Math.random()*300}
    if(t<S.next)return;
    if(light<.3||WX.storm>.5){S.next=t+120+Math.random()*180;return}
    var a=Math.atan2(who.position.z,who.position.x)+(Math.random()-.5)*3.2,rr=W.radiusAt(a),r=Math.random(),dmin=rr*1.45,
      d0=Math.min(145,r<.4?dmin+3+Math.random()*14:r<.75?dmin+17+Math.random()*35:dmin+52+Math.random()*45);
    var dev=(Math.random()-.5)*.8,sg=Math.random()<.5?1:-1;d0=Math.max(d0,dmin/Math.cos(dev)+2);
    S.hd=-a+(sg<0?Math.PI:0)+dev;S.spd=4.5+Math.random()*2;S.dur=40+Math.random()*25;S.t=0;S.ph=Math.random()*6.28;
    var L=S.spd*S.dur*(.3+Math.random()*.4);S.c=new V3(Math.cos(a)*d0-Math.sin(S.hd)*L,0,Math.sin(a)*d0-Math.cos(S.hd)*L);
    var n=4+Math.floor(Math.random()*6);S.list=[];
    for(var i=0;i<n;i++){var D={m:DOLPHS[i],ox:(Math.random()-.5)*7,oz:-Math.random()*9,ph:Math.random()*6.28,sc:.85+Math.random()*.3,y:-1.2,vy:0,vh:S.spd,yaw:S.hd,yr:0,pitch:0,roll:0,cv:0,tb:Math.random()*6.28,
        st:'swim',cy:-1.1-Math.random()*.4,lt:.3+Math.random()*3,kind:'leap',v0:0,spinR:0,lead:null,fol:null,fk:null};
      D.x=S.c.x+Math.sin(S.hd)*D.oz+Math.cos(S.hd)*D.ox;D.z=S.c.z+Math.cos(S.hd)*D.oz-Math.sin(S.hd)*D.ox;
      D.m.g.scale.setScalar(D.sc);D.m.g.visible=true;S.list.push(D)}
    for(var j=0;j+1<n;j+=2)if(Math.random()<.6){var A=S.list[j],B=S.list[j+1];A.fol=B;B.lead=A;B.ox=A.ox+(Math.random()<.5?-1:1)*(.8+Math.random()*.5);B.oz=A.oz-.3-Math.random()*.6;B.lt=99}
    S.active=true;toast('돌고래 떼가 헤엄쳐 갑니다.',5)}
  // 무리의 길: 천천히 굽으며 나아가고, 섬에 너무 다가가면 바깥쪽으로 비켜 간다
  S.t+=dt;var dc=Math.hypot(S.c.x,S.c.z),lim=W.radiusAt(Math.atan2(S.c.z,S.c.x))*1.5+12;
  S.hd+=Math.sin(S.t*.09+S.ph)*.06*dt;
  if(dc<lim){var out=Math.atan2(S.c.x,S.c.z),dv=wrapA(out-S.hd);if(Math.abs(dv)>Math.PI/2-.2)S.hd+=clamp(dv,-1,1)*clamp((lim-dc)/8,0,1)*.9*dt}
  var sh=Math.sin(S.hd),ch=Math.cos(S.hd);S.c.x+=sh*S.spd*dt;S.c.z+=ch*S.spd*dt;
  var under=true;
  for(var k=0;k<S.list.length;k++){var D=S.list[k],G=D.m.g,air=D.st==='air',pPrev=D.pitch;
    // 수평: 제자리(무리 안의 자리) 조금 앞을 향해 방향을 틀고, 뒤처지면 빨라진다. 공중에서는 곧게 날아간다
    var lx=D.ox+Math.sin(S.t*.23+D.ph)*1.1,lz=D.oz+Math.sin(S.t*.17+D.ph*2)*1.4,sx=S.c.x+sh*lz+ch*lx,sz=S.c.z+ch*lz-sh*lx,sd=Math.hypot(sx,sz),sl=W.radiusAt(Math.atan2(sz,sx))*1.42;
    // 제자리가 얕은 물에 걸리면 바깥쪽으로 밀어 둔다
    if(sd<sl){sx*=sl/sd;sz*=sl/sd}
    if(!air){var des=Math.atan2(sx+sh*4-D.x,sz+ch*4-D.z),yr=clamp(wrapA(des-D.yaw),-.9*dt,.9*dt);D.yaw+=yr;D.yr=yr/Math.max(dt,1e-3);
      var e=(sx-D.x)*sh+(sz-D.z)*ch,vT=S.spd*(D.st==='rise'?1.25:1)+clamp(e*.5,-1.5,2);D.vh+=(vT-D.vh)*Math.min(1,dt*1.5)}
    else D.yr=0;
    D.x+=Math.sin(D.yaw)*D.vh*dt;D.z+=Math.cos(D.yaw)*D.vh*dt;
    // 수직: 물속에서는 헤엄치는 깊이로 끌려가고, 오를 때는 위로 가속해 물을 박차고 나오며, 공중에서는 중력만 받는다
    if(D.st==='swim'){D.vy+=(9*(D.cy-D.y)-6*D.vy)*dt;D.lt-=dt;
      if(D.lt<=0&&S.t<S.dur){var kd=D.fk||dolphKind();D.fk=null;dolphRise(D,kd);if(D.fol){D.fol.lt=.1+Math.random()*.15;D.fol.fk=kd}}}
    else if(D.st==='rise'){D.vy+=(D.v0-D.vy)*Math.min(1,dt*3);
      if(D.y>=0&&D.vy>0){D.st='air';D.spinR=D.spinN*6.2832/(2*D.vy/9.8);var nx=D.x+Math.sin(D.yaw)*D.sc,nz=D.z+Math.cos(D.yaw)*D.sc;
        wTmp.set(nx,W.sea,nz);sprayEmit(W.whale,wTmp,D.kind==='roll'?4:Math.round(6+D.v0*2),{spread:.15,up:.5+D.v0*.35,out:.5,vx:Math.sin(D.yaw)*D.vh*.35,vz:Math.cos(D.yaw)*D.vh*.35,life:.8,s0:.18,s1:.55,g:9.8,drag:.5})}}
    else{D.vy-=9.8*dt;D.roll+=D.spinR*dt;
      if(D.y<0&&D.vy<0){D.st='swim';var iv=Math.abs(D.vy);wTmp.set(D.x,W.sea,D.z);
        sprayEmit(W.whale,wTmp,Math.round(5+iv*4),{spread:.3,up:1+iv*.45,out:.8,vx:Math.sin(D.yaw)*D.vh*.2,vz:Math.cos(D.yaw)*D.vh*.2,life:1,s0:.25,s1:.8,g:9.8,drag:.5});
        if(iv>3)sprayEmit(W.whale,wTmp,Math.round(iv*3),{spread:.5,up:.8,out:1.6,life:1.6,s0:.5,s1:1.4,g:3,drag:1.2,delay:.2});
        if(Math.hypot(D.x-who.position.x,D.z-who.position.z)<45)footRipple(D.x,D.z,.9);
        D.lt=D.lead?99:D.kind==='roll'?1.4+Math.random()*2.2:.5+Math.random()*1.4}}
    D.y+=D.vy*dt;if(D.st==='air'||D.y>-.7)under=false;
    // 몸은 지나가는 길의 기울기를 그대로 따르고, 기울기가 바뀌는 만큼 몸이 활처럼 휜다
    D.pitch+=(Math.atan2(D.vy,D.vh)-D.pitch)*Math.min(1,dt*12);
    var cvR=clamp((D.pitch-pPrev)/Math.max(dt,1e-3)/Math.max(1,Math.hypot(D.vh,D.vy)),-.35,.35);D.cv+=(cvR-D.cv)*Math.min(1,dt*8);
    if(D.st!=='air'){var rT=clamp(-D.yr*.6,-.5,.5);D.roll=wrapA(D.roll);D.roll+=(rT-D.roll)*Math.min(1,dt*3)}
    // 꼬리: 물속에서는 힘차게 차고, 오를 때 더 세게, 공중에서는 거의 멈춘다
    var ba=D.st==='air'?.05:D.st==='rise'?.42:.28;D.ba=(D.ba||.28)+(ba-(D.ba||.28))*Math.min(1,dt*5);D.tb+=dt*6.2832*(D.st==='air'?1:D.st==='rise'?3.2:2.2);
    dolphBend(D,D.ba,D.tb,D.cv*D.sc);
    G.position.set(D.x,W.sea+D.y,D.z);G.rotation.set(-D.pitch,D.yaw,D.roll);
  }
  if((S.t>S.dur&&under)||dc>190){S.active=false;S.list.forEach(function(D){D.m.g.visible=false});S.next=t+600+Math.random()*600}
}
// 갈매기 새끼: 회갈색 솜털에 얼룩, 짧은 부리. 둥지 근처를 아장아장 돌아다닌다
function makeChick(sc){
  var g=new THREE.Group(),b=new THREE.Group();g.add(b);b.position.y=.2;
  function fluff(r,ws,hs){var gg=new THREE.SphereGeometry(r,ws,hs),p=gg.attributes.position,cl=new Float32Array(p.count*3),cc=new THREE.Color();
    for(var i=0;i<p.count;i++){var x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=vn3(x*28,y*28,z*28,5),sp=vn3(x*14+3,y*14,z*14,8)>.72?.55:1;
      cc.setRGB(.62,.57,.49).multiplyScalar((.82+.3*n)*sp*(y<-r*.3?1.12:1));cc.convertSRGBToLinear();cl[i*3]=cc.r;cl[i*3+1]=cc.g;cl[i*3+2]=cc.b}
    gg.setAttribute('color',new THREE.BufferAttribute(cl,3));return gg}
  var FM=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});
  add(b,fluff(.15,22,16),FM,0,0,0).scale.set(1,.92,1.18);
  var head=new THREE.Group();head.position.set(0,.13,.12);b.add(head);
  add(head,fluff(.095,18,14),FM,0,0,0);
  var bk=new THREE.ConeGeometry(.022,.07,8);bk.rotateX(Math.PI/2);add(head,bk,mat(0x3a3330,{roughness:.5}),0,-.01,.11);
  var eyes=[];[1,-1].forEach(function(s){eyes.push(add(head,new THREE.SphereGeometry(.014,8,6),mat(0x111111,{roughness:.2}),s*.055,.025,.07));
    var w=add(b,new THREE.SphereGeometry(.06,10,8),FM,s*.13,.02,-.02);w.scale.set(.5,.7,1.3)});
  var legs=[];[1,-1].forEach(function(s){var lg=new THREE.Group();lg.position.set(s*.05,-.11,.02);b.add(lg);add(lg,new THREE.CylinderGeometry(.013,.011,.09,8),mat(0xd99a86,{roughness:.6}),0,-.045,0);add(lg,new THREE.BoxGeometry(.05,.01,.06),mat(0xd99a86,{roughness:.6}),0,-.09,.02);legs.push(lg)});
  g.scale.setScalar(sc);return {g:g,b:b,head:head,legs:legs,eyes:eyes};
}
// 밤: 둥지 가운데로 모여 서로 붙어 앉아(체온을 나누며) 고개를 묻고 잔다. 사람이 4.5m 안이면 고개를 들고, 3m 안이면 흩어졌다가 다시 모인다
function updChicks(dt,t,who){
  // 밤이나 비 올 때만 둥지에 모여 서로 몸을 붙이고 잔다(체온 나누기). 낮에는 저마다 따로 논다
  var N=W.nest,night=sunE()<.02||shelterUpd()||WX.rain>.3,nC=W.chicks.length;
  for(var i=0;i<W.chicks.length;i++){var c=W.chicks[i],dx=c.x-who.position.x,dz=c.z-who.position.z,d=Math.hypot(dx,dz)||.01,spd=0;
    // 새끼마다 좋아하는 쪽(fa)과 다니는 거리(roam)가 다르다
    if(c.fa===undefined){c.fa=Math.random()*6.283;c.roam=2.5+Math.random()*3}
    // 날이 개거나 아침이 되면 저마다 다른 때에 일어나 흩어진다
    if(!night&&c.mode==='huddle'){c.mode='idle';c.timer=.5+Math.random()*6}
    if(d<3){var tx=N.x+dx/d*2.6,tz=N.z+dz/d*2.6;c.tx=tx;c.tz=tz;c.mode='run'}
    else if(night&&c.mode!=='run'){var ha=i/nC*6.283+.4,hx=N.x+Math.cos(ha)*.19,hz=N.z+Math.sin(ha)*.19;
      if(Math.hypot(hx-c.x,hz-c.z)>.07){c.tx=hx;c.tz=hz;c.mode='walk'}else{c.mode='huddle';c.x+=(hx-c.x)*Math.min(1,dt*2);c.z+=(hz-c.z)*Math.min(1,dt*2);c.yaw+=wrapA(Math.atan2(N.x-c.x,N.z-c.z)-c.yaw)*Math.min(1,dt*2)}}
    c.alT=night&&d<4.5?2.5:(c.alT||0)-dt;
    // 낮: 쪼거나, 제가 좋아하는 쪽으로 둥지에서 몇 m 떨어진 곳을 돌아다니거나, 가끔 다른 새끼 곁으로 가 본다. 물이 닿는 곳에는 가지 않는다
    if(c.mode==='idle'&&!night){c.timer-=dt;c.peck=Math.max(0,c.peck-dt);if(c.timer<=0){if(Math.random()<.35)c.peck=.5;else{
        if(Math.random()<.1)c.fa=Math.random()*6.283;
        var sib=nC>1&&Math.random()<.25?W.chicks[(i+1+Math.floor(Math.random()*(nC-1)))%nC]:null;
        for(var tr=0;tr<6;tr++){var a,r,bx,bz;
          if(sib){a=Math.random()*6.283;r=.3+Math.random()*.4;bx=sib.x;bz=sib.z}else{a=c.fa+(Math.random()-.5)*2.4;r=.5+Math.random()*c.roam;bx=N.x;bz=N.z}
          var px=bx+Math.cos(a)*r,pz=bz+Math.sin(a)*r;if(W.height(px,pz)>W.swash[binOf(px,pz)]+.15){c.tx=px;c.tz=pz;c.mode='walk';break}}}
      c.timer=1.5+Math.random()*4}}
    if(c.mode!=='idle'&&c.mode!=='huddle'){var mx=c.tx-c.x,mz=c.tz-c.z,ml=Math.hypot(mx,mz);spd=c.mode==='run'?1.5:.45;
      if(ml<.05){c.mode='idle';c.timer=1+Math.random()*3;spd=0}else{var st=Math.min(ml,spd*dt);c.x+=mx/ml*st;c.z+=mz/ml*st;c.yaw+=wrapA(Math.atan2(mx,mz)-c.yaw)*Math.min(1,dt*7)}}
    var m=spd>0?1:0;c.wp+=dt*spd*24;var C=c.m;
    C.g.position.set(c.x,W.height(c.x,c.z),c.z);C.g.rotation.set(0,c.yaw,Math.sin(c.wp)*.16*m);
    // 잘 때: 주저앉아 다리를 솜털 속에 접고, 몸을 부풀리고, 고개를 숙여 묻고 눈을 감는다. 천천히 숨 쉰다
    var sl=c.mode==='huddle'?1:0,tk=sl&&c.alT<=0?1:0;c.sk=(c.sk||0)+(sl-(c.sk||0))*Math.min(1,dt*2);c.tk=(c.tk||0)+(tk-(c.tk||0))*Math.min(1,dt*(tk?1.2:4));
    C.legs[0].rotation.x=lerp(Math.sin(c.wp)*.6*m,1.3,c.sk);C.legs[1].rotation.x=lerp(-Math.sin(c.wp)*.6*m,1.3,c.sk);
    C.b.position.y=.2+Math.abs(Math.cos(c.wp))*.02*m-.075*c.sk+.004*Math.sin(t*2+i*1.7)*c.sk;C.b.scale.setScalar(1+.07*c.sk);
    C.head.rotation.x=lerp(c.peck>0?Math.sin((.5-c.peck)/.5*Math.PI)*.9:Math.sin(t*1.7+i)*.06,.6,c.tk);C.head.rotation.y=lerp(m?0:Math.sin(t*.8+i*2)*.5,0,c.sk);
    C.head.position.y=.13-.04*c.tk;C.head.position.z=.12-.03*c.tk;C.eyes.forEach(function(ey){ey.scale.y=1-.85*c.tk});
  }
}
// 밤배: 아주 가끔 밤에 수평선 저 멀리 불을 켠 배가 천천히 지나간다. 배는 바다 안개에 묻혀 형체만 어렴풋하고,
// 불빛은 안개를 뚫고 저마다 다른 박자로 은은하게 일렁이며 빛살이 번진다. 밝은 불빛 아래로는 물결에 부서진 반사 기둥이 이쪽으로 뻗고,
// 어선은 가끔 탐조등 빛줄기를 천천히 휘두른다. 현등은 보는 쪽에 따라 붉은빛(왼쪽)이나 초록빛(오른쪽)만 보인다
var nightShip=(function(){
  var S=null,PT_VS=['attribute vec3 col;attribute float sz,ph,vis,blk;uniform float uT,uPx,uK;varying vec3 vC;varying float vI;',
    'void main(){float tw=.8+.12*sin(uT*1.1+ph*7.)+.08*sin(uT*2.9+ph*13.)*sin(uT*.37+ph);',
    '  float bl=mix(1.,.12+.88*pow(.5+.5*sin(uT*2.4+ph),3.),blk);',
    '  vI=vis*tw*bl*uK;vC=col;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=sz*uPx*.035;}'].join('\n'),
  PT_FS=['uniform float uT;varying vec3 vC;varying float vI;',
    'void main(){vec2 q=gl_PointCoord-.5;float r=length(q);',
    // 작은 심지, 두 겹의 번짐, 가로로 길고 세로로 짧은 빛살(천천히 조금씩 기운다)
    '  float core=exp(-r*r*1800.),halo=exp(-r*r*120.)*.3+exp(-r*r*16.)*.07;',
    '  float an=.12*sin(uT*.21);vec2 qr=vec2(cos(an)*q.x-sin(an)*q.y,sin(an)*q.x+cos(an)*q.y);',
    '  float sp=exp(-abs(qr.y)*260.)*exp(-abs(qr.x)*8.)+exp(-abs(qr.x)*260.)*exp(-abs(qr.y)*13.)*.55;',
    '  float a=(core*1.6+halo+sp*.32)*vI;if(a<.002)discard;gl_FragColor=vec4(vC*a,1.);}'].join('\n'),
  RF_VS=['attribute float aL,aX;varying float vL,vX;varying vec3 vW;void main(){vL=aL;vX=aX;vW=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}'].join('\n'),
  RF_FS=['uniform float uT,uK,uR,uLen;uniform vec4 uAmp,uPh;uniform vec3 uC;varying float vL,vX;varying vec3 vW;',
    'float rh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float rn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rh(i),rh(i+vec2(1.,0.)),f.x),mix(rh(i+vec2(0.,1.)),rh(i+vec2(1.,1.)),f.x),f.y);}',
    'float radiusAt(float th){return uR*(1.+uAmp.x*sin(2.*th+uPh.x)+uAmp.y*sin(3.*th+uPh.y)+uAmp.z*sin(4.*th+uPh.z)+uAmp.w*sin(5.*th+uPh.w));}',
    // 물 위 반사 기둥: 불빛 아래에서 이쪽으로 뻗으며, 물결마다 끊어진 조각들이 흘러온다. 섬 가까이(얕은 물과 땅)에는 그리지 않는다
    'void main(){float d=length(vW.xz);if(d<radiusAt(atan(vW.z,vW.x))*1.08)discard;',
    '  float g1=rn(vec2(vX*1.8+uT*.12,vL*.42-uT*2.1)),g2=rn(vec2(vX*4.1-uT*.2,vL*1.3-uT*3.3));',
    '  float gl=smoothstep(.5,.88,g1*.65+g2*.35)*(.55+.45*rn(vec2(3.1,vL*.05-uT*.45)));',
    '  float a=uK*exp(-vX*vX*2.4)*gl*exp(-vL/(uLen*.42))*smoothstep(0.,6.,vL+3.);',
    '  if(a<.002)discard;gl_FragColor=vec4(uC*a,1.);}'].join('\n'),
  BM_FS=['uniform float uK;varying float vA;varying vec3 vN,vV;void main(){float e=abs(dot(normalize(vN),normalize(vV)));float a=uK*pow(e,1.6)*pow(max(1.-vA,0.),1.4)*.15;gl_FragColor=vec4(vec3(1.,.94,.82)*a,1.);}'].join('\n'),
  BM_VS=['varying float vA;varying vec3 vN,vV;void main(){vA=position.x/130.;vec4 wp=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=cameraPosition-wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}'].join('\n');
  function addMat(u,vs,fs,side){return new THREE.ShaderMaterial({uniforms:u,vertexShader:vs,fragmentShader:fs,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:side||THREE.FrontSide})}
  function build(){
    var g=new THREE.Group();g.visible=false;scene.add(g);var hullM=new THREE.MeshBasicMaterial({color:0x05080d});
    // 선체(앞이 +x): 옆모습을 뽑아 만든다. 물에 잠긴 아랫부분은 먼바다 수면에 가린다
    var sh=new THREE.Shape();sh.moveTo(-14,-1);sh.lineTo(-14.6,3.6);sh.lineTo(9,3.8);sh.lineTo(15.6,5.2);sh.lineTo(13,-1);sh.lineTo(-14,-1);
    var hg=new THREE.ExtrudeGeometry(sh,{depth:6,bevelEnabled:false});hg.translate(0,0,-3);add(g,hg,hullM,0,0,0);
    // 아주 멀리 작게 보이므로 선체·선실·돛대 덩어리만 둔다
    add(g,new THREE.BoxGeometry(7,5.5,5.4),hullM,-8,6.4,0);add(g,new THREE.BoxGeometry(.4,10.5,.4),hullM,3,9,0);
    var fish=new THREE.Group(),cargo=new THREE.Group();g.add(fish);g.add(cargo);
    // 불빛: [x,y,z, r,g,b, 크기, 보이는 쪽(0 사방, -1 왼쪽, 1 오른쪽, 2 뒤, 3 앞쪽), 깜박임, 어선만(1)/화물선만(2)]
    var L=[[3,14.4,0, 1,.97,.9, 1,3,0,0],[-8.4,10.6,0, 1,.96,.88, .9,3,0,0],[-6,8.2,-2.8, 1,.22,.16, .75,-1,0,0],[-6,8.2,2.8, .3,1,.55, .75,1,0,0],[-14.6,4.6,0, 1,.95,.85, .7,2,0,0],
      [-5,6.6,-1.8, 1,.72,.38, .5,0,0,0],[-5,6.6,-.6, 1,.75,.4, .5,0,0,0],[-5,6.6,.6, 1,.7,.36, .5,0,0,0],[-5,6.6,1.8, 1,.74,.4, .5,0,0,0],[-9.5,6.4,2.75, 1,.72,.38, .45,0,0,0],[-9.5,6.4,-2.75, 1,.72,.38, .45,0,0,0],
      [5,9.6,1.2, 1,.9,.72, 1.35,0,0,1],[5,9.6,-1.2, 1,.9,.72, 1.35,0,0,1],[-1,9.9,0, 1,.92,.76, 1.2,0,0,1],[3,15.3,0, 1,.6,.16, .8,0,1,1],
      [-2,7.6,2.6, 1,.8,.5, .5,0,0,2],[7,7.4,-2.6, 1,.8,.5, .45,0,0,2]];
    var n=L.length,pa=new Float32Array(n*3),ca=new Float32Array(n*3),sa=new Float32Array(n),pha=new Float32Array(n),va=new Float32Array(n),ba=new Float32Array(n);
    for(var i=0;i<n;i++){var l=L[i];pa[i*3]=l[0];pa[i*3+1]=l[1];pa[i*3+2]=l[2];ca[i*3]=l[3];ca[i*3+1]=l[4];ca[i*3+2]=l[5];sa[i]=l[6];pha[i]=i*1.7+.3;ba[i]=l[8]}
    var pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pa,3));pg.setAttribute('col',new THREE.BufferAttribute(ca,3));pg.setAttribute('sz',new THREE.BufferAttribute(sa,1));
    pg.setAttribute('ph',new THREE.BufferAttribute(pha,1));pg.setAttribute('vis',new THREE.BufferAttribute(va,1));pg.setAttribute('blk',new THREE.BufferAttribute(ba,1));
    var PU={uT:{value:0},uPx:PXU,uK:{value:0}},pts=new THREE.Points(pg,addMat(PU,PT_VS,PT_FS));pts.frustumCulled=false;pts.renderOrder=9;g.add(pts);
    // 반사 기둥: 불빛 아래 물 위에 띠를 깔고 매 프레임 이쪽을 향하게 다시 놓는다
    var SEG=48,cols=[];
    function column(lx,ly,lz,cr,cg,cb,k,only){var ps=new Float32Array((SEG+1)*2*3),al=new Float32Array((SEG+1)*2),ax=new Float32Array((SEG+1)*2),ix=[];
      for(var j=0;j<SEG;j++){var b=j*2;ix.push(b,b+1,b+2,b+1,b+3,b+2)}
      var cg2=new THREE.BufferGeometry();cg2.setAttribute('position',new THREE.BufferAttribute(ps,3));cg2.setAttribute('aL',new THREE.BufferAttribute(al,1));cg2.setAttribute('aX',new THREE.BufferAttribute(ax,1));cg2.setIndex(ix);
      var U={uT:PU.uT,uK:{value:0},uR:waterU.uR,uAmp:waterU.uAmp,uPh:waterU.uPh,uC:{value:new THREE.Vector3(cr,cg,cb)},uLen:{value:300}},m=new THREE.Mesh(cg2,addMat(U,RF_VS,RF_FS,THREE.DoubleSide));
      m.frustumCulled=false;m.renderOrder=8;m.visible=false;scene.add(m);cols.push({m:m,ps:ps,al:al,ax:ax,lp:new V3(lx,ly,lz),k:k,only:only,U:U})}
    column(4,9.6,0, 1,.86,.62, .55,1);column(3,14.4,0, .95,.92,.86, .22,0);column(-5,6.6,0, 1,.7,.38, .26,0);
    // 탐조등(어선): 꼭짓점이 등에 있고 +x로 130m 뻗는 원뿔
    var cone=new THREE.ConeGeometry(9,130,28,1,true);cone.translate(0,-65,0);cone.rotateZ(Math.PI/2);
    var BU={uK:{value:0}},beamPiv=new THREE.Group();beamPiv.position.set(-1,10.2,0);fish.add(beamPiv);var beam=new THREE.Mesh(cone,addMat(BU,BM_VS,BM_FS,THREE.DoubleSide));beam.frustumCulled=false;beam.renderOrder=9;beamPiv.add(beam);
    S={g:g,fish:fish,cargo:cargo,pts:pts,PU:PU,L:L,va:va,cols:cols,BU:BU,beamPiv:beamPiv,active:false,next:-1,beamK:0,beamOn:false,beamT:0}}
  var tv=new V3(),tw=new V3();
  return {update:function(dt,t,who,light){
    if(!S)build();S.PU.uT.value=t;
    var nightK=1-smoothstep(.06,.22,light),okWX=WX.rain<.4&&WX.storm<.25;
    if(!S.active){
      if(nightK<.5||!okWX){S.next=-1;return}
      if(S.next<0)S.next=t+60+Math.random()*120;
      if(t<S.next)return;
      // 지금 바라보는 쪽 수평선, 1000~1150m 밖을 옆으로 가로지른다(3~4분). 선체는 바다 안개에 완전히 묻히고 불빛만 점처럼 모여 보인다.
      // 카메라가 그리는 거리(1500m) 안에서 지나가도록 길이를 맞춘다
      var fx=who.position.x-camera.position.x,fz=who.position.z-camera.position.z,fa=Math.atan2(fz,fx)+(Math.random()-.5)*1.4,D=1000+Math.random()*150;
      var hx=-Math.sin(fa),hz=Math.cos(fa),dv=(Math.random()-.5)*.8,c0=Math.cos(dv),s0=Math.sin(dv);var h2x=hx*c0-hz*s0,h2z=hx*s0+hz*c0;if(Math.random()<.5){h2x=-h2x;h2z=-h2z}
      S.ax=who.position.x+Math.cos(fa)*D;S.az=who.position.z+Math.sin(fa)*D;S.hx=h2x;S.hz=h2z;S.len=1150+Math.random()*150;S.spd=5+Math.random()*2;S.s=-S.len/2;
      S.isFish=Math.random()<.55;S.fish.visible=S.isFish;S.cargo.visible=!S.isFish;S.g.scale.setScalar(S.isFish?.55:.7);S.beamPiv.scale.setScalar(2.15/.55);S.beamOn=false;S.beamT=4+Math.random()*10;S.beamK=0;
      S.active=true;S.g.visible=true;S.cols.forEach(function(c){c.m.visible=!(c.only&&!S.isFish)})}
    S.s+=S.spd*dt;var u=(S.s+S.len/2)/S.len;
    if(u>=1||!okWX&&nightK<.05){S.active=false;S.g.visible=false;S.cols.forEach(function(c){c.m.visible=false});S.next=t+240+Math.random()*480;return}
    var K=nightK*smoothstep(0,.12,u)*(1-smoothstep(.88,1,u)),x=S.ax+S.hx*S.s,z=S.az+S.hz*S.s,yaw=Math.atan2(-S.hz,S.hx),G=S.g;
    G.position.set(x,W.sea-.62+Math.sin(t*.53)*.12,z);G.rotation.set(Math.sin(t*.37+1)*.025,yaw,Math.sin(t*.5)*.015,'YXZ');G.updateMatrixWorld();
    S.PU.uK.value=K;
    // 현등·선미등: 보는 방향에 따라 켜고 끈다
    var vx=camera.position.x-x,vz=camera.position.z-z,vl=Math.hypot(vx,vz)||1,fwd=(vx*Math.cos(yaw)-vz*Math.sin(yaw))/vl,side=(vx*Math.sin(yaw)+vz*Math.cos(yaw))/vl;
    for(var i=0;i<S.L.length;i++){var l=S.L[i],sd=l[7],v=1;
      if(sd===-1)v=smoothstep(.05,-.15,side);else if(sd===1)v=smoothstep(-.05,.15,side);else if(sd===2)v=smoothstep(-.3,-.45,fwd);else if(sd===3)v=smoothstep(-.45,-.3,fwd);
      if(l[9]===1&&!S.isFish||l[9]===2&&S.isFish)v=0;S.va[i]=v}
    S.pts.geometry.attributes.vis.needsUpdate=true;
    // 탐조등: 켜졌다 꺼졌다 하며 천천히 좌우로 휘두른다
    if(S.isFish){S.beamT-=dt;if(S.beamT<=0){S.beamOn=!S.beamOn;S.beamT=S.beamOn?14+Math.random()*20:10+Math.random()*25}
      S.beamK+=((S.beamOn?1:0)-S.beamK)*Math.min(1,dt*.8);S.beamPiv.rotation.set(0,Math.sin(t*.23)*.7+.5*Math.sin(t*.071),-.07+.03*Math.sin(t*.4));S.BU.uK.value=K*S.beamK}
    // 반사 기둥: 불빛 바로 아래 물 위에서 이쪽(카메라에서 40m 앞)까지. 가까운 물은 해수면 위, 먼바다 판 위에서는 그 높이에 맞춘다
    for(var c=0;c<S.cols.length;c++){var C=S.cols[c];if(!C.m.visible)continue;tv.copy(C.lp);G.localToWorld(tv);
      var bx=tv.x,bz=tv.z,ex=camera.position.x-bx,ez=camera.position.z-bz,el=Math.hypot(ex,ez)||1,len=Math.max(10,el-40);ex/=el;ez/=el;var px=-ez,pz=ex;C.U.uLen.value=len;C.U.uK.value=K*C.k;
      for(var j=0;j<=48;j++){var a=j/48,al=Math.pow(a,1.6)*len,cx=bx+ex*al,cz=bz+ez*al,w=1.1+al*.02,y=Math.max(Math.abs(cx),Math.abs(cz))>157?W.sea-.55:W.sea+.14;
        for(var sdd=0;sdd<2;sdd++){var q=(j*2+sdd),sg=sdd?1:-1;C.ps[q*3]=cx+px*w*sg;C.ps[q*3+1]=y;C.ps[q*3+2]=cz+pz*w*sg;C.al[q]=al;C.ax[q]=sg}}
      var ga=C.m.geometry.attributes;ga.position.needsUpdate=true;ga.aL.needsUpdate=true;ga.aX.needsUpdate=true}
  }};
})();
// 모닥불 불꽃: 상자 안을 광선으로 훑으며, 위로 흐르는 난류 노이즈로 일그러뜨린 불꽃 단면(텍스처)을 쌓아 혀처럼 갈라지는 불길을 그린다.
// mattatz/THREE.Fire, typeWolffo/THREE.Fire(MIT)의 셰이더와 불꽃 텍스처를 옮김. 그림체에 맞게 쌓인 세기를 붉은 가장자리·주황·노란 심지의
// 은은한 세 띠와 부드러운 그라데이션을 반반 섞고, 가장자리는 반투명하게 사라진다(밝기를 더하지 않아 눈부시지 않다).
// 위로 갈수록 좁아지고 아래일수록 뜨거워 심지가 밑동에 모인다. 깊이를 따져 앞에 있는 사람·천막에 가려지고, 휴대폰에서는 광선 걸음을 줄인다
// 잉걸불: 장작의 갈라진 틈과 얼룩에만 불씨가 빛나고, 불 가운데·아래일수록 뜨겁고 불 밖으로 나온 끝은 식어 있다. 천천히 숨 쉬듯 일렁인다.
// uBurn(0~1)이 오르면 무늬를 따라 조금씩 부서져 사라지고, 타 들어가는 경계에는 밝은 불테가 선다(-1이면 부서지지 않는 장작)
var EMBER_U={uFC:{value:new V3()},uT:{value:0}};
function emberMat(m,burn){var U={uBurn:{value:burn?0:-1}};m.userData.ember=U;m.userData.base=m.color.clone();
  m.onBeforeCompile=function(sh){sh.uniforms.uFC=EMBER_U.uFC;sh.uniforms.uT=EMBER_U.uT;sh.uniforms.uBurn=U.uBurn;
    sh.vertexShader='varying vec3 vEl;varying vec3 vEw;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEl=position;vEw=(modelMatrix*vec4(position,1.)).xyz;');
    sh.fragmentShader=['varying vec3 vEl;varying vec3 vEw;uniform vec3 uFC;uniform float uT,uBurn;',
      'float eh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}',
      'float en(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(eh(i),eh(i+vec3(1.,0.,0.)),f.x),mix(eh(i+vec3(0.,1.,0.)),eh(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(eh(i+vec3(0.,0.,1.)),eh(i+vec3(1.,0.,1.)),f.x),mix(eh(i+vec3(0.,1.,1.)),eh(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}',
      ''].join('\n')+sh.fragmentShader
      .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat eDs=en(vEl*9.)*.75+en(vEl*23.)*.25,eTh=uBurn*1.15-.1;if(uBurn>=0.&&eDs<eTh)discard;')
      .replace('#include <color_fragment>','#include <color_fragment>\nfloat eEdge=uBurn>0.?1.-smoothstep(eTh,eTh+.08,eDs):0.;diffuseColor.rgb*=1.-.75*eEdge;')
      .replace('#include <emissivemap_fragment>',['#include <emissivemap_fragment>',
        '{float rr=1.-abs(en(vEl*vec3(9.,3.,9.)+3.)*2.-1.),crk=smoothstep(.8,.95,rr),blot=smoothstep(.62,.8,en(vEl*4.+7.));',
        ' float heat=(1.-smoothstep(.12,.55,distance(vEw.xz,uFC.xz)))*(1.-smoothstep(uFC.y+.05,uFC.y+.4,vEw.y));',
        ' float pul=.75+.25*sin(uT*1.1+en(vEl*2.)*9.);',
        ' totalEmissiveRadiance*=(crk*.9+blot*.35)*(.25+.75*heat)*pul;',
        ' totalEmissiveRadiance+=eEdge*vec3(1.,.6,.18)*1.6;}'].join('\n'))};
  m.customProgramCacheKey=function(){return 'ember'};return m}
var FIRE_TEX=null;
function makeFireVol(){
  if(!FIRE_TEX){FIRE_TEX=new THREE.TextureLoader().load('/textures/fire.png');FIRE_TEX.magFilter=FIRE_TEX.minFilter=THREE.LinearFilter;FIRE_TEX.wrapS=FIRE_TEX.wrapT=THREE.ClampToEdgeWrapping;FIRE_TEX.generateMipmaps=false}
  var mob=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
  var m=new THREE.ShaderMaterial({defines:{ITERATIONS:mob?'14':'20',OCTAVES:'3'},
    uniforms:{fireTex:{value:FIRE_TEX},color:{value:new THREE.Color(1,.74,.5)},time:{value:0},seed:{value:Math.random()*19.19},invModelMatrix:{value:new THREE.Matrix4()},scale:{value:new V3(1,1,1)},
      noiseScale:{value:new THREE.Vector4(.9,1.8,.9,.23)},magnitude:{value:1.2},lacunarity:{value:2},gain:{value:.5},uK:{value:0},uStep:{value:mob?20/14:1}},
    vertexShader:'varying vec3 vWorldPos;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;}',
    fragmentShader:['uniform vec3 color;uniform float time,seed,magnitude,lacunarity,gain,uK,uStep;uniform mat4 invModelMatrix;uniform vec3 scale;uniform vec4 noiseScale;uniform sampler2D fireTex;varying vec3 vWorldPos;',
      'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
      'float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);',
      '  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
      '  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);',
      '  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
      '  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
      '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}',
      'float turbulence(vec3 p){float sum=0.0,freq=1.0,amp=1.0;for(int i=0;i<OCTAVES;i++){sum+=abs(snoise(p*freq))*amp;freq*=lacunarity;amp*=gain;}return sum;}',
      'float samplerFire(vec3 p,vec4 sc){vec2 st=vec2(sqrt(dot(p.xz,p.xz)),p.y);if(st.x<=0.0||st.x>=1.0||st.y<=0.0||st.y>=1.0)return 0.0;',
      '  float mr=.95*(1.-.62*st.y),tp=1.-smoothstep(mr*.55,mr,st.x),hot=1.25-.75*st.y;',
      '  p.y-=(seed+time)*sc.w;p*=sc.xyz;st.y+=sqrt(st.y)*magnitude*turbulence(p);if(st.y<=0.0||st.y>=1.0)return 0.0;return texture2D(fireTex,st).r*tp*hot;}',
      'void main(){vec3 rayPos=vWorldPos,rayDir=normalize(rayPos-cameraPosition);float rayLen=0.0288*length(scale)*uStep,H=0.0;',
      '  for(int i=0;i<ITERATIONS;i++){rayPos+=rayDir*rayLen;vec3 lp=(invModelMatrix*vec4(rayPos,1.0)).xyz;lp.y+=0.5;lp.xz*=2.0;H+=samplerFire(lp,noiseScale);}',
      '  H*=uStep*uK;float a=smoothstep(.25,.85,H)*.95;if(a<.01)discard;',
      // 호박색: 가장자리 진한 호박 → 호박 → 연한 금빛 심지
      '  vec3 cb=mix(vec3(.88,.42,.08),vec3(1.,.66,.2),smoothstep(1.1,1.3,H));cb=mix(cb,vec3(1.,.86,.5),smoothstep(1.75,1.95,H));',
      '  vec3 cs=mix(vec3(.9,.45,.09),vec3(1.,.69,.23),smoothstep(.4,1.3,H));cs=mix(cs,vec3(1.,.9,.6),smoothstep(1.3,2.2,H));',
      '  gl_FragColor=vec4(mix(cs,cb,.5),a);}'].join('\n'),
    transparent:true,depthWrite:false});
  var mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),m);mesh.renderOrder=5;mesh.userData.noShadow=true;return mesh}
// 먼 하늘의 새: 해안에서 떨어진 바다 위를 맴돌거나 해안을 따라 섬 둘레를 날아가는 갈매기 실루엣과, 가끔 물가를 따라 낮게 지나가는 도요새 떼.
// 둘 다 빛을 받지 않는 실루엣이라 하늘과 바다 안개에 묻혀 멀수록 옅어진다. 날갯짓은 셰이더에서 하고(바깥 날개가 조금 늦게 따라온다),
// 활공하는 갈매기는 날개가 M자로 꺾인다. 도요새는 등이 짙고 배가 희어서, 무리가 한꺼번에 몸을 틀 때마다 흰 배가 반짝인다
var skyBirds=(function(){
  var S=null,dm=new THREE.Object3D(),U={uT:{value:0}};
  function birdGeo(pip){var h=pip?.24:.7,P=[],Wt=[],I=[];
    function v(x,y,z,w){P.push(x,y,z);Wt.push(w);return P.length/3-1}
    var L=pip?.3:.55,nose=v(0,0,L*.5,0),tail=v(0,0,-L*.5,0),l=v(-.05,0,0,0),r=v(.05,0,0,0),u=v(0,.04,0,0),dn=v(0,-.04,0,0);
    I.push(nose,l,u,nose,u,r,nose,r,dn,nose,dn,l,tail,u,l,tail,r,u,tail,dn,r,tail,l,dn);
    [1,-1].forEach(function(s){var rf=v(s*.04,0,.12,0),rb=v(s*.04,0,-.12,0),ef=v(s*h*.48,0,.1,.48),eb=v(s*h*.48,0,-.14,.48),tip=v(s*h,0,-.08,1),tb=v(s*h*.8,0,-.16,.8);
      I.push(rf,rb,ef,ef,rb,eb,ef,eb,tip,tip,eb,tb)});
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('aW',new THREE.Float32BufferAttribute(Wt,1));g.setIndex(I);return {g:g,h:h}}
  function flock(pip,n,color){var G=birdGeo(pip),g=G.g,A={ph:new Float32Array(n),rt:new Float32Array(n),am:new Float32Array(n)};
    g.setAttribute('aPh',new THREE.InstancedBufferAttribute(A.ph,1));g.setAttribute('aRate',new THREE.InstancedBufferAttribute(A.rt,1));g.setAttribute('aAmp',new THREE.InstancedBufferAttribute(A.am,1));
    var m=new THREE.MeshBasicMaterial({color:color,side:THREE.DoubleSide}),ms=pip?'.2':'1.',sp=G.h.toFixed(2);
    m.onBeforeCompile=function(sh){sh.uniforms.uT=U.uT;
      sh.vertexShader='attribute float aW,aPh,aRate,aAmp;uniform float uT;varying float vTop;\n'+sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nfloat fph=uT*aRate+aPh;transformed.y+=(aAmp*(sin(fph)*aW*.5+sin(fph-1.1)*max(aW-.48,0.)*.7)+(1.-min(aAmp/.5,1.))*'+ms+'*(.18*min(aW,.48)-.3*max(aW-.48,0.)))*'+sp+';')
        .replace('#include <project_vertex>','#include <project_vertex>\nvec3 bN=normalize((modelMatrix*instanceMatrix*vec4(0.,1.,0.,0.)).xyz),bP=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;vTop=dot(bN,cameraPosition-bP);');
      // 도요새: 위에서 보면 짙은 등, 아래에서 보면 흰 배
      if(pip)sh.fragmentShader='varying float vTop;\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=vTop>0.?vec3(.23,.2,.17):vec3(.86,.86,.82);')};
    m.customProgramCacheKey=function(){return 'skybird'+ms+sp};
    var im=new THREE.InstancedMesh(g,m,n);im.frustumCulled=false;im.count=0;scene.add(im);return {im:im,A:A,n:n}}
  function build(){S={fg:flock(false,8,0x3a3f46),gz:flock(true,30,0xffffff),birds:[],geese:{active:false,next:-1},regen:0}}
  // 먼바다 갈매기 한 무리를 새로 띄운다: 맴도는 녀석과 해안을 따라 섬 둘레를 도는 녀석이 섞인다
  function spawnGulls(who){var n=3+Math.floor(Math.random()*6),R0=W.R,B=[];
    for(var i=0;i<n;i++){var ca=Math.atan2(who.position.z,who.position.x)+(Math.random()-.5)*3.6,cd=R0*1.6+30+Math.random()*140,coast=Math.random()<.5;
      B.push({coast:coast,ca:ca,cd:cd,cx:Math.cos(ca)*cd,cz:Math.sin(ca)*cd,r:coast?cd:15+Math.random()*35,a:Math.random()*6.283,dir:Math.random()<.5?1:-1,
        alt:10+Math.random()*35,spd:7+Math.random()*2,glide:Math.random()<.5,gt:Math.random()*3,amp:0,ph:Math.random()*6.283,yaw:0})}
    S.birds=B}
  return {update:function(dt,t,who,light){
    if(!S)build();U.uT.value=t;var ok=WX.rain<.5&&WX.storm<.4;
    // 먼바다 갈매기: 낮에만. 몇 분마다 무리를 새로 띄워 자리와 수가 바뀐다
    var FG=S.fg;
    if(light>.25&&ok){S.regen-=dt;if(S.regen<=0||!S.birds.length){spawnGulls(who);S.regen=150+Math.random()*200}
      for(var i=0;i<S.birds.length;i++){var b=S.birds[i],w=b.spd/b.r;b.a+=w*b.dir*dt;
        var cx=b.coast?0:b.cx,cz=b.coast?0:b.cz,x=cx+Math.cos(b.a)*b.r,z=cz+Math.sin(b.a)*b.r,y=b.alt+Math.sin(t*.3+i)*2;
        var vx=-Math.sin(b.a)*b.dir,vz=Math.cos(b.a)*b.dir,yaw=Math.atan2(vx,vz),bank=-b.dir*Math.atan(b.spd*b.spd/(9.8*b.r))*.8;
        b.gt-=dt;if(b.gt<=0){b.glide=!b.glide;b.gt=b.glide?2+Math.random()*4:1+Math.random()*1.5}b.amp+=((b.glide?0:.7)-b.amp)*Math.min(1,dt*3);
        dm.position.set(x,y,z);dm.rotation.set(0,yaw,bank,'YXZ');dm.scale.setScalar(1.3);dm.updateMatrix();FG.im.setMatrixAt(i,dm.matrix);
        FG.A.ph[i]=b.ph;FG.A.rt[i]=9.5;FG.A.am[i]=b.amp}
      FG.im.count=S.birds.length;FG.im.instanceMatrix.needsUpdate=true;FG.im.geometry.attributes.aAmp.needsUpdate=true;FG.im.geometry.attributes.aPh.needsUpdate=true;FG.im.geometry.attributes.aRate.needsUpdate=true}
    else FG.im.count=0;
    // 도요새 떼: 낮과 해 질 녘에 4~8분에 한 번꼴, 15~30마리가 섬 둘레 물가 바다 위 3~14m 높이로 낮게 해안을 따라 지나간다.
    // 무리 전체가 굽이치는 길을 따라 함께 방향을 틀고(가까운 녀석부터 조금씩 늦게 따라 돈다), 가끔 한꺼번에 휙 몸을 뒤집으며, 무리의 모양도 늘었다 줄었다 한다
    var GZ=S.gz,Q=S.geese;
    if(!Q.active){GZ.im.count=0;if(light<.15||!ok){Q.next=-1;return}if(Q.next<0)Q.next=t+90+Math.random()*150;if(t<Q.next)return;
      Q.n=15+Math.floor(Math.random()*16);Q.ca=Math.atan2(who.position.z,who.position.x)+(Math.random()<.5?1:-1)*(.9+Math.random()*.6);Q.dir=Math.random()<.5?1:-1;
      Q.rd=W.R*(1.25+Math.random()*.3)+10;Q.alt=3+Math.random()*11;Q.spd=12+Math.random()*4;Q.trav=0;Q.len=500+Math.random()*300;Q.hist=[];Q.flip=0;Q.flipT=4+Math.random()*6;
      Q.off=[];for(var j=0;j<Q.n;j++)Q.off.push({x:(Math.random()-.5)*7,y:(Math.random()-.5)*2.2,z:(Math.random()-.5)*5,p:Math.random()*6.283,d:Math.random()*.35});
      Q.active=true}
    Q.trav+=Q.spd*dt;if(Q.trav>Q.len){Q.active=false;GZ.im.count=0;Q.next=t+240+Math.random()*240;return}
    // 무리 중심: 섬 둘레 물가를 따라 돌되, 반지름과 높이가 굽이치며 출렁인다
    Q.ca+=Q.dir*Q.spd/Q.rd*dt;var wig=Math.sin(t*.45)*14+Math.sin(t*.9+1.3)*6,rr=Q.rd+wig,cx=Math.cos(Q.ca)*rr,cz=Math.sin(Q.ca)*rr,cy=Q.alt+Math.sin(t*.55)*2.5+Math.sin(t*1.3)*.8;
    var tx=-Math.sin(Q.ca)*Q.dir,tz=Math.cos(Q.ca)*Q.dir,dr=(Math.cos(t*.45)*.45*14+Math.cos(t*.9+1.3)*.9*6)/Q.spd,hx=tx+Math.cos(Q.ca)*dr,hz=tz+Math.sin(Q.ca)*dr,hl=Math.hypot(hx,hz);hx/=hl;hz/=hl;
    var yawC=Math.atan2(hx,hz);if(Q.prevYaw===undefined)Q.prevYaw=yawC;var yr=wrapA(yawC-Q.prevYaw)/Math.max(dt,1e-3);Q.prevYaw=yawC;
    Q.hist.unshift({yaw:yawC,bank:clamp(-yr*.9,-1.1,1.1)});if(Q.hist.length>40)Q.hist.pop();
    Q.flipT-=dt;if(Q.flipT<=0){Q.flip=1;Q.flipT=5+Math.random()*8}Q.flip=Math.max(0,Q.flip-dt*1.6);
    var spread=1+.35*Math.sin(t*.37);
    for(var k=0;k<Q.n;k++){var o=Q.off[k],hi=Q.hist[Math.min(Q.hist.length-1,Math.round(o.d*60))],yw=hi.yaw,bk=hi.bank+Math.sin(Math.PI*Math.min(1,Math.max(0,Q.flip*1.4-o.d*2)))*1.3*(o.p>3.14?1:-1);
      var cy2=Math.cos(yw),sy2=Math.sin(yw),lx=o.x*spread+Math.sin(t*.8+o.p)*.6,lz=o.z*spread+Math.cos(t*.7+o.p)*.5;
      dm.position.set(cx+lx*cy2+lz*sy2,Math.max(W.sea+1,cy+o.y*spread+Math.sin(t*1.1+o.p)*.3),cz-lx*sy2+lz*cy2);dm.rotation.set(0,yw,bk,'YXZ');dm.scale.setScalar(1.3);dm.updateMatrix();GZ.im.setMatrixAt(k,dm.matrix);
      GZ.A.ph[k]=o.p;GZ.A.rt[k]=55;GZ.A.am[k]=.6}
    GZ.im.count=Q.n;GZ.im.instanceMatrix.needsUpdate=true;GZ.im.geometry.attributes.aAmp.needsUpdate=true;GZ.im.geometry.attributes.aPh.needsUpdate=true;GZ.im.geometry.attributes.aRate.needsUpdate=true;
  }};
})();
var WHALE=null,DOLPHS=null;
var world=null, W=null;      // W: 현재 섬의 값들
var state=null;
var dummy=new THREE.Object3D();

function buildIsland(seed){
  if(world){ scene.remove(world); world.traverse(function(o){ if(o.geometry&&o.geometry!==FROND)o.geometry.dispose(); }); }
  world=new THREE.Group(); scene.add(world);
  var rng=mulberry32(seed);
  var R=34+rng()*26, peak=5+rng()*11, off=rng()*500;
  var amp=[0.16*rng(),0.13*rng(),0.09*rng(),0.06*rng()], ph=[rng()*6.28,rng()*6.28,rng()*6.28,rng()*6.28];
  function radiusAt(th){var s=1;for(var k=0;k<4;k++)s+=amp[k]*Math.sin((k+2)*th+ph[k]);return R*s}
  function noise(x,z){var ix=Math.floor(x),iz=Math.floor(z),fx=sm(x-ix),fz=sm(z-iz);
    var a=hash2(ix,iz,seed),b=hash2(ix+1,iz,seed),c=hash2(ix,iz+1,seed),d=hash2(ix+1,iz+1,seed);
    return lerp(lerp(a,b,fx),lerp(c,d,fx),fz)}
  function fbm(x,z){return noise(x,z)*0.6+noise(x*2.1,z*2.1)*0.28+noise(x*4.3,z*4.3)*0.12}
  function tAt(x,z){var d=Math.sqrt(x*x+z*z);return 1-d/radiusAt(Math.atan2(z,x))}
  function rawH(x,z){
    var t=tAt(x,z);
    if(t<=0) return t>-0.12?t*4.0909:Math.max(-7,-0.4909+(t+0.12)*9);
    if(t<0.22) return t/0.22*0.9;
    var u=(t-0.22)/0.78;
    return 0.9+sm(u)*peak*(0.3+0.7*fbm(x*0.04+off,z*0.04+off))+noise(x*0.3,z*0.3)*0.14*Math.min(1,u*4);
  }
  // 움막 자리: 파도가 닿지 않는 안쪽 풀밭에 터를 평평하게 다진다
  var ths=rng()*Math.PI*2, rs=radiusAt(ths)*0.62, sx=Math.cos(ths)*rs, sz=Math.sin(ths)*rs, campH=rawH(sx,sz);
  function height(x,z){var h=rawH(x,z),d=Math.hypot(x-sx,z-sz);if(d>=9.5)return h;var w=sm(1-clamp((d-5)/4.5,0,1))*clamp((tAt(x,z)-0.22)/0.07,0,1);return lerp(h,campH,w)}
  function shore(th){var rr=radiusAt(th);for(var d=rr*1.25;d>0;d-=0.4){var x=Math.cos(th)*d,z=Math.sin(th)*d;if(height(x,z)>0.14)return{x:x,z:z,d:d}}return{x:0,z:0,d:0}}

  // 지형: 부드러운 면, 모래에서 풀로 번지는 색
  var g=new THREE.PlaneGeometry(240,240,200,200); g.rotateX(-Math.PI/2);
  var p=g.attributes.position, colA=new Float32Array(p.count*3), c=new THREE.Color();
  function mix(a,b,t){t=clamp(t,0,1);c.setRGB(lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t))}
  var bed=[.72,.87,.79],wet=[.80,.72,.55],sand=[.97,.90,.72],gA=[.58,.80,.46],gB=[.44,.70,.42],top=[.72,.82,.54];
  for(var i=0;i<p.count;i++){
    var x=p.getX(i),z=p.getZ(i),h=height(x,z); p.setY(i,h);
    if(h<-0.1) mix(bed,wet,(h+1.5)/1.4);
    else if(h<0.45) mix(wet,sand,(h+0.1)/0.22);
    else if(h<0.95) mix(sand,sand,0);
    else{ var n=noise(x*0.18+9,z*0.18+9), gr=[lerp(gA[0],gB[0],n),lerp(gA[1],gB[1],n),lerp(gA[2],gB[2],n)];
      if(h<1.5) mix(sand,gr,sm((h-0.95)/0.55)); else mix(gr,top,(h-(0.9+peak*0.55))/(peak*0.3)); }
    c.convertSRGBToLinear(); colA[i*3]=c.r;colA[i*3+1]=c.g;colA[i*3+2]=c.b;
  }
  g.setAttribute('color',new THREE.BufferAttribute(colA,3)); g.computeVertexNormals();
  var terrain=new THREE.Mesh(g,terrainMat(peak,sx,sz));
  terrain.receiveShadow=true; terrain.userData.noShadow=true; world.add(terrain);

  waterU.uR.value=R; waterU.uAmp.value.set(amp[0],amp[1],amp[2],amp[3]); waterU.uPh.value.set(ph[0],ph[1],ph[2],ph[3]);

  // 물가 거품과 밀려오는 물결선
  var N=220, rad=new Float32Array(N+1); for(var q0=0;q0<=N;q0++)rad[q0]=radiusAt(q0/N*6.2832);
  var cs=new Float32Array(N+1), sn=new Float32Array(N+1); for(var q1=0;q1<=N;q1++){cs[q1]=Math.cos(q1/N*6.2832);sn[q1]=Math.sin(q1/N*6.2832)}
  var wetS=makeStrip(N,5,[.40,.32,.20],.3,-1,1); world.add(wetS);
  var fpGeo=new THREE.CircleGeometry(1,14); fpGeo.rotateX(-Math.PI/2);
  var prints=new THREE.InstancedMesh(fpGeo,new THREE.MeshBasicMaterial({color:0xffffff,blending:THREE.MultiplyBlending,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,fog:false}),FP);
  for(var f0=0;f0<FP;f0++){dummy.position.set(0,-50,0);dummy.rotation.set(0,0,0);dummy.scale.setScalar(0.0001);dummy.updateMatrix();prints.setMatrixAt(f0,dummy.matrix);prints.setColorAt(f0,WHITE)}
  prints.frustumCulled=false;prints.renderOrder=2;prints.userData.noShadow=true;world.add(prints);

  var M={
    wood:mat(0xa67c52,{roughness:.85}), trunk:windify(mat(0xb89268,{roughness:.9,vertexColors:true}),'trunk'),
    canvas:canvasMat(0xd6b878),
    rock:rockMat(0xbcbcb3,0,0), nut:mat(0x6b4a2e,{roughness:.7}), berry:mat(0xe05a4a,{roughness:.5}),
    bush:mat(0x5aa856,{roughness:.85}), bush2:mat(0x6fbb5f,{roughness:.85}),
    radio:mat(0x3d7f86,{roughness:.5}), panel:mat(0x24386e,{roughness:.25,metalness:.3}), metal:mat(0xdfe3e4,{roughness:.35,metalness:.5}),
    white:mat(0xffffff,{roughness:.8,side:THREE.DoubleSide}), petal:mat(0xfff3c4,{roughness:.7})
  };

  // 그늘막, 선반, 라디오
  var shelter=new THREE.Group(); shelter.position.set(sx,height(sx,sz),sz); shelter.rotation.y=Math.atan2(Math.cos(ths),Math.sin(ths)); world.add(shelter);
  // 천막: 기둥·용마루·지붕만 1.25배로 키운다 (선반·라디오·모닥불은 그대로)
  var tent=new THREE.Group();tent.scale.setScalar(1.25);shelter.add(tent);var tentStrips=[];
  [-1.7,1.7].forEach(function(zz){[1,-1].forEach(function(s){var pole=add(tent,new THREE.CylinderGeometry(.09,.12,5.2,12),M.wood,s*0.35,2.28,zz);pole.rotation.z=s*0.5})});
  var ridge=add(tent,new THREE.CylinderGeometry(.085,.085,4.7,12),M.wood,0,2.98,0); ridge.rotation.x=Math.PI/2;
  [1,-1].forEach(function(s){
    // 한 장짜리 천: 용마루에서 땅 가까이까지 덮는다(경사 3.51m). 아래 끝단은 해져서 들쭉날쭉하다 (아래쪽은 s 방향에 따라 y 부호가 다르다)
    var rg=new THREE.PlaneGeometry(4.3,3.51,30,16),rp=rg.attributes.position;
    for(var v=0;v<rp.count;v++)if(rp.getY(v)*s<-1.7)rp.setY(v,rp.getY(v)-s*.06*Math.abs(Math.sin(rp.getX(v)*5)*Math.sin(rp.getX(v)*1.7+1.)));
    rg.rotateX(-Math.PI/2);rg.rotateY(Math.PI/2);
    // 기둥 사이에서 가운데가 살짝 처지고, 천이 잔주름진다
    for(var v2=0;v2<rp.count;v2++){var ax=-rp.getZ(v2),wv=clamp((1.755+s*rp.getX(v2))/3.51,0,1);rp.setY(v2,rp.getY(v2)-.07*Math.sin(Math.PI*(ax+2.15)/4.3)*Math.sin(Math.PI*Math.min(wv,1))+.012*Math.sin(ax*6.3+s)*Math.sin(rp.getX(v2)*4.1))}
    rg.computeVertexNormals();
    var roof=new THREE.Mesh(rg,M.canvas);roof.position.set(s*(0.18+1.53*0.48),2.92-1.53*0.878+0.03,0);roof.rotation.z=-s*1.07;tent.add(roof);
    tentStrips.push({g:rg,base:Float32Array.from(rp.array),s:s,ph:s>0?0:2.3});
  });
  add(shelter,new THREE.BoxGeometry(2.4,.12,.55),M.wood,0,.95,3.3);
  [-1,1].forEach(function(s){add(shelter,new THREE.CylinderGeometry(.06,.06,.95,10),M.wood,s*1.05,.47,3.3)});
  var shelfBottles=[];
  for(var b=0;b<3;b++){var sb=makeBottle(false); sb.scale.setScalar(1.15); sb.position.set(-0.75+b*0.75,1.02,3.3); shelter.add(sb); shelfBottles.push(sb)}
  add(shelter,new THREE.BoxGeometry(.9,.8,.9),M.wood,-2.7,.4,2.9);
  var radio=new THREE.Group(); radio.position.set(-2.7,.8,2.9); shelter.add(radio);
  add(radio,new THREE.BoxGeometry(.75,.45,.3),M.radio,0,.23,0);
  var ant=add(radio,new THREE.CylinderGeometry(.015,.015,.9,6),M.metal,.3,.85,0); ant.rotation.z=-.25;
  var sp=add(radio,new THREE.BoxGeometry(.6,.03,.4),M.panel,-.05,.5,-.05); sp.rotation.x=-.5;
  var dial=add(radio,new THREE.CylinderGeometry(.07,.07,.04,14),M.metal,.2,.23,.16); dial.rotation.x=Math.PI/2;
  var spk=add(radio,new THREE.CylinderGeometry(.11,.11,.03,16),M.panel,-.14,.23,.155); spk.rotation.x=Math.PI/2;
  // 그늘막 살림: 묶은 밧줄, 깔개와 베개, 불 피운 자리, 모아 둔 열매
  var rope=mat(0xd8c8a0,{roughness:1}), ash=mat(0x4a4540,{roughness:1});
  [-1.7,1.7].forEach(function(zz){var rp=add(tent,new THREE.TorusGeometry(.17,.04,8,18),rope,0,2.93,zz);rp.scale.set(1,1,1.6)});
  add(shelter,new THREE.BoxGeometry(1.5,.05,3),mat(0xcfae78,{roughness:1}),0,.04,0);
  for(var mi=0;mi<5;mi++)add(shelter,new THREE.BoxGeometry(1.52,.055,.07),mat(0xb99562,{roughness:1}),0,.042,-1.2+mi*.6);
  add(shelter,new THREE.SphereGeometry(.3,14,10),mat(0xf3ead6,{roughness:1}),0,.16,-1.1).scale.set(1.5,.45,1);
  var fire=new THREE.Group();fire.position.set(2.7,.02,3.3);shelter.add(fire);
  for(var fs0=0;fs0<8;fs0++){var st=add(fire,FIRE_ROCK,M.rock,Math.cos(fs0*.785)*.62,.08,Math.sin(fs0*.785)*.62);st.scale.set(1,.7,1.2);st.rotation.y=fs0}
  add(fire,new THREE.CylinderGeometry(.5,.5,.03,16),ash,0,.02,0);
  var logM=emberMat(mat(0x4a4540,{roughness:1,emissive:col(0xff8a24),emissiveIntensity:0}),false);
  for(var fl=0;fl<3;fl++){var lg=add(fire,new THREE.CylinderGeometry(.06,.07,.9,8),logM,0,.12,0);lg.rotation.set(Math.PI/2,0,fl*1.05,'ZYX')}
  // 불꽃(입체 불길), 번지는 빛, 튀는 불티
  var fvol=makeFireVol();fvol.position.y=.1;fire.add(fvol);var flames=[fvol];
  var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xffb040,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0,fog:false}));glow.position.y=.55;glow.scale.setScalar(7);glow.renderOrder=6;fire.add(glow);
  var spG=new THREE.BufferGeometry();spG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(28*3),3));
  var sparks=new THREE.Points(spG,new THREE.PointsMaterial({color:0xffc66a,size:.07,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));sparks.frustumCulled=false;sparks.renderOrder=6;fire.add(sparks);
  [[-2.0,.24,3.75],[-1.6,.24,3.9],[-1.85,.24,4.15],[-1.8,.6,3.93]].forEach(function(q){add(shelter,new THREE.SphereGeometry(.25,14,12),q[1]>.5?M.bush2:M.nut,q[0],q[1],q[2])});
  shelter.updateMatrixWorld(true);
  var radioPos=new V3(); radio.getWorldPosition(radioPos);
  var firePos=new V3(); fire.getWorldPosition(firePos);
  // 모닥불 앞 앉을 자리와 그 오른쪽 장작더미
  // 모닥불 앞 앉을 자리 두 곳: 바다 쪽 자리는 움막을 비스듬히 바라보고, 움막 쪽 자리는 불 너머 바다를 바라본다. 자리마다 오른쪽에 장작더미가 있다
  var LOG_G=new THREE.CylinderGeometry(.075,.085,.75,10);LOG_G.rotateZ(Math.PI/2);var logEnd=mat(0xd9b98a,{roughness:.9}),piles=[];
  function seatAt(lx,lz,tx,tz,side){var p=shelter.localToWorld(new V3(lx,0,lz)),q=shelter.localToWorld(new V3(tx,0,tz)),yaw=Math.atan2(q.x-p.x,q.z-p.z),rx=-Math.cos(yaw),rz=Math.sin(yaw);
    var pile=new THREE.Group(),px=p.x+rx*.85,pz=p.z+rz*.85;pile.position.set(px,height(px,pz),pz);pile.rotation.y=yaw+Math.PI/2;pile.scale.setScalar(.72);world.add(pile);piles.push(pile);
    [[0,.08,-.17],[0,.08,0],[0,.08,.17],[0,.23,-.085],[0,.23,.085],[0,.38,0]].forEach(function(q2,i){var lg=add(pile,LOG_G,M.wood,(i%2?.04:-.04),q2[1],q2[2]);lg.rotation.x=i*.7;
      [-1,1].forEach(function(s){var cp=add(lg,new THREE.CircleGeometry(.078,12),logEnd,s*.376,0,0);cp.rotation.y=s*Math.PI/2})});
    return {x:p.x,z:p.z,yaw:yaw,side:side}}
  var seats=[seatAt(3.25,5.0,1.4,1.3,'sea'),seatAt(3.2,1.75,3.2,9,'tent')];

  // 야자나무: 휜 줄기, 처지는 잎, 열매
  var trees=[], nT=14+Math.floor(rng()*18);
  for(var k=0;k<400&&trees.length<nT;k++){
    var a=rng()*6.283, d=Math.sqrt(rng())*R*1.1, x2=Math.cos(a)*d, z2=Math.sin(a)*d;
    if(tAt(x2,z2)<0.2||Math.hypot(x2-sx,z2-sz)<8) continue;
    trees.push({x:x2,z:z2,y:height(x2,z2),h:5+rng()*3.4,lean:(rng()-.3)*2.6,ry:rng()*6.283});
  }
  var perTree=13, frG=FROND.clone(), aTH=new Float32Array(trees.length*perTree);trees.forEach(function(T,ti){for(var q=0;q<perTree;q++)aTH[ti*perTree+q]=T.h});
  frG.setAttribute('aTH',new THREE.InstancedBufferAttribute(aTH,1));var fr=new THREE.InstancedMesh(frG,FROND_MAT,trees.length*perTree);
  var nuts=new THREE.InstancedMesh(new THREE.SphereGeometry(.24,12,10),M.nut,trees.length*3);
  var greens=[col(0x5fb35a),col(0x4c9f52),col(0x78c468)], fi=0, ni=0;
  var treeTrunks=[];
  trees.forEach(function(T){
    var tm=add(world,trunkGeo(T.h,T.lean),M.trunk,T.x,T.y,T.z); tm.rotation.y=T.ry; treeTrunks.push(tm);
    var tx=T.x+T.lean*Math.cos(T.ry), tz=T.z-T.lean*Math.sin(T.ry), ty=T.y+T.h-.1;
    for(var f=0;f<perTree;f++){
      var inner=f>=9; dummy.position.set(tx,ty,tz);
      dummy.rotation.set(inner?-.75+rng()*.3:-.1+rng()*.45,(inner?f*1.57+.6:f*.698)+rng()*.3,0,'YXZ');
      dummy.scale.setScalar(inner?.62:.9+rng()*.3); dummy.updateMatrix();
      fr.setMatrixAt(fi,dummy.matrix); fr.setColorAt(fi,greens[inner?2:f%2]); fi++;
    }
    for(var q=0;q<3;q++){dummy.position.set(tx+Math.cos(q*2.1+T.ry)*.3,ty-.3,tz+Math.sin(q*2.1+T.ry)*.3);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();nuts.setMatrixAt(ni++,dummy.matrix)}
  });
  fr.instanceMatrix.needsUpdate=true; if(fr.instanceColor)fr.instanceColor.needsUpdate=true; nuts.instanceMatrix.needsUpdate=true;
  fr.frustumCulled=false; nuts.frustumCulled=false; world.add(fr); world.add(nuts); var treeObjs=[fr,nuts];

  // 열매 덤불: 어두운 속 덩어리 위에 작은 잎을 겹겹이 붙이고, 붉은 열매를 몇 송이씩 단다
  var leafCnt=coarse?120:170, bushes=[];
  for(var k2=0;k2<200&&bushes.length<11;k2++){
    var a2=rng()*6.283, d2=Math.sqrt(rng())*R, x3=Math.cos(a2)*d2, z3=Math.sin(a2)*d2;
    if(tAt(x3,z3)<0.26||Math.hypot(x3-sx,z3-sz)<7) continue;
    bushes.push({x:x3,z:z3,y:height(x3,z3)+.3,ry:rng()*6.283,s:.85+rng()*.5});
  }
  var bushCore=windify(mat(0x2c6331,{roughness:.9}),'core'), leaves=new THREE.InstancedMesh(LEAF,LEAF_MAT,bushes.length*leafCnt), berries=new THREE.InstancedMesh(new THREE.SphereGeometry(.07,12,10),windify(mat(0xffffff,{roughness:.28}),'core'),bushes.length*18);
  var lpal=[col(0x3d8a42),col(0x4c9c4a),col(0x5cae54),col(0x6fbe5f),col(0x86c862)], bpal=[col(0xd8382c),col(0xe9503a),col(0xb92a22)], li=0, bi=0, lc=new THREE.Color();
  bushes.forEach(function(B){
    var cs=Math.cos(B.ry),sn=Math.sin(B.ry),lobes=[[0,0,0,.8],[.6,-.05,.2,.58],[-.5,-.08,.35,.52],[.1,.05,-.55,.5]].map(function(q){return [B.x+(q[0]*cs+q[2]*sn)*B.s,B.y+q[1]*B.s,B.z+(-q[0]*sn+q[2]*cs)*B.s,q[3]*B.s]});
    lobes.forEach(function(q){add(world,new THREE.SphereGeometry(q[3]*.86,20,14),bushCore,q[0],q[1],q[2]).scale.y=.82});
    var wsum=0;lobes.forEach(function(q){wsum+=q[3]*q[3]});
    for(var n=0;n<leafCnt;n++){var pick=rng()*wsum,L=lobes[0];for(var j=0;j<lobes.length;j++){pick-=lobes[j][3]*lobes[j][3];if(pick<=0){L=lobes[j];break}}
      var dy=-.35+rng()*1.35,dq=Math.sqrt(Math.max(0,1-dy*dy)),da=rng()*6.283,dx=Math.cos(da)*dq,dz=Math.sin(da)*dq,rr=L[3]*(.78+rng()*.2);
      dummy.position.set(L[0]+dx*rr,L[1]+dy*rr*.82,L[2]+dz*rr);
      dummy.rotation.set(-Math.asin(clamp(dy*.8+.25,-1,1))+(rng()-.5)*.6,Math.atan2(dx,dz)+(rng()-.5)*.8,(rng()-.5)*1.4,'YXZ');
      dummy.scale.setScalar((.8+rng()*.5)*B.s);dummy.updateMatrix();leaves.setMatrixAt(li,dummy.matrix);
      lc.copy(lpal[Math.floor(rng()*5)]).multiplyScalar(.72+.32*(dy*.5+.5));leaves.setColorAt(li++,lc)}
    for(var c3=0;c3<6;c3++){var L2=lobes[Math.floor(rng()*lobes.length)],ba=rng()*6.283,by=.1+rng()*.6,bq=Math.sqrt(1-by*by),br=L2[3]*.97;
      for(var c4=0;c4<3;c4++){dummy.position.set(L2[0]+Math.cos(ba)*bq*br+(rng()-.5)*.1,L2[1]+by*br*.82+(rng()-.5)*.08,L2[2]+Math.sin(ba)*bq*br+(rng()-.5)*.1);
        dummy.rotation.set(0,0,0,'XYZ');dummy.scale.setScalar(.8+rng()*.45);dummy.updateMatrix();berries.setMatrixAt(bi,dummy.matrix);berries.setColorAt(bi++,bpal[c4%3])}}
  });
  leaves.count=li;berries.count=bi;leaves.instanceMatrix.needsUpdate=true;leaves.instanceColor.needsUpdate=true;berries.instanceMatrix.needsUpdate=true;berries.instanceColor.needsUpdate=true;
  leaves.frustumCulled=false;berries.frustumCulled=false;world.add(leaves);world.add(berries);
  // 바위: 해변 바위는 파도가 닿는 자리에 무리 지어 놓고, 풀밭 바위에는 이끼가 낀다
  var rkB=rockMat(0xb2afa5,0,1), rkI=rockMat(0xb8b9b0,0.9,0), beachRocks=[], rseed=seed%9973;
  function brPt(a,h){var d=radiusAt(a)*(1-h/0.9*0.22);return [Math.cos(a)*d,Math.sin(a)*d]}
  for(var cI=0,tr=0;cI<4&&tr<80;tr++){
    var ca=rng()*6.283;if(Math.abs(wrapA(ca-ths))<0.45||Math.abs(wrapA(ca-ths-0.55))<0.25)continue;
    var clash=false;for(var q=0;q<beachRocks.length;q++)if(Math.abs(wrapA(ca-beachRocks[q].a))<0.5)clash=true;if(clash)continue;cI++;
    var nR=1+Math.floor(rng()*3);
    for(var j2=0;j2<nR;j2++){var big=j2===0,sc=big?1.0+rng()*.7:.35+rng()*.4,hh=big?.04+rng()*.24:rng()*.42,pt=brPt(ca+(big?0:(rng()-.5)*.1),hh);
      if(!big){pt[0]+=(rng()-.5)*2.2;pt[1]+=(rng()-.5)*2.2}
      var rg=rockGeo(rseed+cI*7+j2,big?46:28,.6+rng()*.25),rk=add(world,rg,rkB,pt[0],height(pt[0],pt[1])-.22*sc,pt[1]);rk.scale.setScalar(sc);rk.rotation.y=rng()*6.283;
      beachRocks.push({a:ca,x:pt[0],z:pt[1],r:sc*.92})}
  }
  for(var k3=0,ni2=0;k3<200&&ni2<5;k3++){
    var a3=rng()*6.283,d3=Math.sqrt(rng())*R,x4=Math.cos(a3)*d3,z4=Math.sin(a3)*d3;
    if(tAt(x4,z4)<0.3||Math.hypot(x4-sx,z4-sz)<9)continue;ni2++;
    var sc2=.7+rng()*.9,rk2=add(world,rockGeo(rseed+100+ni2,40,.55+rng()*.3),rkI,x4,height(x4,z4)-.2*sc2,z4);rk2.scale.setScalar(sc2);rk2.rotation.y=rng()*6.283;
    if(rng()<.6){var sc3=sc2*(.3+rng()*.25),ox=x4+(rng()-.5)*2.6*sc2,oz=z4+(rng()-.5)*2.6*sc2;var rk3=add(world,rockGeo(rseed+150+ni2,24,.6),rkI,ox,height(ox,oz)-.15*sc3,oz);rk3.scale.setScalar(sc3)}
  }
  // 암초: 물가 바깥 얕은 바다(바닥 깊이 0.1~1.7m)에 크고 작은 바위가 무리 지어 있다. 물 위로 드러난 것도, 물 바로 아래 잠긴 것도 있다.
  // 바위는 모두 바닥까지 닿게 세로 크기를 맞추고, 너무 깊어 보이지 않을 자리는 건너뛴다
  var reefs=[],reefC=[],rr_=mulberry32(seed*13+777),nRC=3+Math.floor(rr_()*3);
  for(var rc=0,rt=0;rc<nRC&&rt<160;rt++){var ra=rr_()*6.283;if(Math.abs(wrapA(ra-ths))<.55)continue;
    var rcl=false;for(var q4=0;q4<reefC.length;q4++)if(Math.abs(wrapA(ra-reefC[q4]))<.5)rcl=true;if(rcl)continue;
    var rr0=radiusAt(ra),placed=0,nR2=2+Math.floor(rr_()*4);
    for(var j3=0;j3<nR2;j3++){var big2=j3===0,sc4=big2?1.1+rr_()*1.7:.3+rr_()*.8,sy=.6+rr_()*.25;
      for(var tryR=0;tryR<8;tryR++){var aa=ra+(big2?0:(rr_()-.5)*.14*45/rr0),dd=rr0*(1.03+rr_()*.2),x5=Math.cos(aa)*dd,z5=Math.sin(aa)*dd,bed=height(x5,z5);
        if(bed>-.1||bed<-1.7)continue;
        // 드러난 높이: 큰 바위는 대개 물 위로, 작은 바위는 반쯤 잠긴다
        var top=big2?(rr_()<.8?.2+rr_()*.8*sc4/2:-.2):(rr_()<.5?rr_()*.45:-.12-rr_()*.4);
        var span=top-bed+.15,sYs=clamp(span/(2*sy*.95),.45*sc4,1.35*sc4);top=bed-.15+sYs*2*sy*.95;if(top<-.75)continue;
        var cy=bed-.15+sYs*sy*.95,rk4=add(world,rockGeo(rseed+300+rc*11+j3,big2?46:28,sy),rkB,x5,cy,z5);rk4.scale.set(sc4,sYs,sc4);rk4.rotation.set((rr_()-.5)*.25,rr_()*6.283,(rr_()-.5)*.25);
        reefs.push({x:x5,z:z5,r:sc4*.92,top:top});placed++;break}}
    if(placed)reefC.push(ra);rc+=placed?1:0}
  var rkAll=beachRocks.map(function(B){return {x:B.x,z:B.z,r:B.r,top:-99}}).concat(reefs);
  for(var q2=0;q2<32;q2++){var BR=rkAll[q2];waterU.uRocks.value[q2].set(BR?BR.x:9999,BR?BR.z:9999,BR?BR.r:0,BR?BR.top:-99)}
  // 풀, 들꽃, 조약돌
  function scatter(geo,m,count,ok,place){var im=new THREE.InstancedMesh(geo,m,count),n=0;
    for(var t=0;t<count*30&&n<count;t++){var a=rng()*6.283,d=Math.sqrt(rng())*R*1.2,x=Math.cos(a)*d,z=Math.sin(a)*d,tt=tAt(x,z);if(!ok(tt,x,z))continue;
      dummy.position.set(x,height(x,z),z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);place(dummy);dummy.updateMatrix();im.setMatrixAt(n++,dummy.matrix)}
    im.count=n;im.instanceMatrix.needsUpdate=true;im.frustumCulled=false;world.add(im);return im}
  // 풀밭: 빽빽한 풀 사이로 노란 민들레와 흰 홀씨가 핀다
  var PS=coarse?48:66, patches=[]; grassU.r.value=PS/2;
  var gcol=[col(0x4f9a3c),col(0x5fae45),col(0x6cbb4e),col(0x7cc85a),col(0x8fc94f)];
  var gp=makePatch(tuftGeo(rng),GRASS_MAT,coarse?7000:13000,PS,rng,function(x,z,h,r){return h>1.0+r*0.4&&Math.hypot(x-sx,z-sz)>5.8+r*1.2},function(r){return .75+r*.6});
  for(var gi=0;gi<gp.n;gi++)gp.im.setColorAt(gi,gcol[gi%5]); gp.im.instanceColor.needsUpdate=true; patches.push(gp);
  var yg=new THREE.SphereGeometry(.09,10,6); yg.scale(1,.42,1); yg.translate(0,.5,0);
  patches.push(makePatch(yg,FLOWER_Y,coarse?350:700,PS,rng,function(x,z,h,r){return h>1.35&&Math.hypot(x-sx,z-sz)>6.5},function(r){return .8+r*.5}));
  var wg=new THREE.SphereGeometry(.1,10,8); wg.translate(0,.56,0);
  patches.push(makePatch(wg,FLOWER_W,coarse?250:500,PS,rng,function(x,z,h,r){return h>1.35&&Math.hypot(x-sx,z-sz)>6.5},function(r){return .8+r*.5}));
  // 해변의 잔것들: 조개, 불가사리, 떠밀려 온 나무
  scatter(new THREE.SphereGeometry(.12,10,8),mat(0xf5ddd2,{roughness:.5}),45,function(t){return t>0.02&&t<0.2},function(o){o.scale.set(1,.45,1.35);o.rotation.y=rng()*6;o.position.y+=.03});
  var star=new THREE.Shape(); for(var sp0=0;sp0<10;sp0++){var sr=sp0%2?.11:.3,sa0=sp0*Math.PI/5;if(sp0)star.lineTo(Math.cos(sa0)*sr,Math.sin(sa0)*sr);else star.moveTo(sr,0)}
  var starG=new THREE.ExtrudeGeometry(star,{depth:.05,bevelEnabled:true,bevelSize:.03,bevelThickness:.03,bevelSegments:2}); starG.rotateX(-Math.PI/2);
  scatter(starG,mat(0xea8a6c,{roughness:.8}),7,function(t){return t>0.03&&t<0.16},function(o){o.rotation.y=rng()*6;o.position.y+=.04});
  scatter(new THREE.CylinderGeometry(.13,.09,2.6,9),mat(0xd2c0a4,{roughness:1}),4,function(t,x,z){return t>0.06&&t<0.16&&Math.hypot(x-sx,z-sz)>6},function(o){o.rotation.set(Math.PI/2,0,rng()*6,'ZYX');o.position.y+=.1});
  // 얕은 물 아래: 물결에 흔들리는 수초 포기와 해초 덤불, 잔돌
  // 미역: 가장자리가 물결치는 납작한 잎이 서너 장씩 한 포기를 이룬다. 크지 않고 드문드문 있다
  var sgG=(function(){var pos=[],cl=[],idx=[],n=0;for(var b=0;b<4;b++){var a=rng()*6.283,h=.2+rng()*.18,w=.035+rng()*.02,lean=.03+rng()*.08,ox=(rng()-.5)*.08,oz=(rng()-.5)*.08,ca=Math.cos(a),sa=Math.sin(a),ph=rng()*6;
      for(var r2=0;r2<=8;r2++){var u=r2/8,ww=w*Math.sin(Math.PI*(.12+.8*u))*(1.1-u*.3),out=lean*u,tw=u*1.2;
        for(var sd=-1;sd<=1;sd+=2){var ruf=Math.sin(u*22+ph+sd)*.012*u;var lx=ww*sd,lz=ruf;var rx=lx*Math.cos(tw)-lz*Math.sin(tw),rz=lx*Math.sin(tw)+lz*Math.cos(tw);
          pos.push(ox+ca*out-sa*rx+ca*rz,h*u,oz+sa*out+ca*rx+sa*rz);var cc=.55+.55*u;cl.push(cc,cc*.97,cc*.85)}}
      for(var r3=0;r3<8;r3++){var i=n+r3*2;idx.push(i,i+1,i+2,i+1,i+3,i+2)}n+=18}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));g.setIndex(idx);g.computeVertexNormals();return g})();
  var sgM=mat(0xffffff,{roughness:.8,side:THREE.DoubleSide,vertexColors:true});
  sgM.onBeforeCompile=function(sh){sh.uniforms.uT3=windU;sh.uniforms.uSG=causU.sea;sh.vertexShader='uniform float uT3,uSG;\n'+sh.vertexShader.replace('#include <project_vertex>',['vec4 wq=vec4(transformed,1.);','#ifdef USE_INSTANCING','wq=instanceMatrix*wq;','#endif','wq=modelMatrix*wq;',
    // 파도가 밀려오고 빠질 때마다 잎이 앞뒤로 휩쓸리고, 잎 끝으로 갈수록 늦게 따라오며 크게 나부낀다
    'vec2 rd=normalize(wq.xz+vec2(1e-4));float u=clamp(position.y/.38,0.,1.);float k=pow(u,1.3);float wv=uT3*1.15+length(wq.xz)*.9;',
    'wq.xz+=rd*(sin(wv-u*1.6)*.11+sin(wv*2.3-u*3.)*.025)*k+vec2(-rd.y,rd.x)*sin(uT3*1.7+dot(wq.xz,vec2(.7,.4))-u*2.)*.035*k;wq.y-=k*abs(sin(wv-u*1.6))*.04;',
    '#ifdef USE_INSTANCING','float by=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).y;float ex=smoothstep(-.02,.08,wq.y-(uSG-.12));wq.xz+=rd*(wq.y-by)*.9*ex;wq.y=mix(wq.y,by+(wq.y-by)*.15,ex);','#endif',
    'vec4 mvPosition=viewMatrix*wq;gl_Position=projectionMatrix*mvPosition;'].join('\n'))};
  sgM.customProgramCacheKey=function(){return 'seagrass'};
  var sg=scatter(sgG,sgM,coarse?60:110,function(t){return t>-0.11&&t<-0.045},function(o){var s2=.8+rng()*.5;o.rotation.set(0,rng()*6.283,0);o.scale.set(s2,s2*(.85+rng()*.4),s2)});
  var sgc=[col(0x5c5a26),col(0x6d5f2a),col(0x4c5124),col(0x77682f),col(0x585c2b)];for(var sgi=0;sgi<sg.count;sgi++)sg.setColorAt(sgi,sgc[sgi%5]);sg.instanceColor.needsUpdate=true;sg.userData.noShadow=true;
  scatter(rockGeo(rseed+330,14,.55),rkB,120,function(t){return t>-0.1&&t<0},function(o){var ps=.09+rng()*.15;o.scale.set(ps*(1+rng()*.5),ps,ps*(1+rng()*.5));o.rotation.y=rng()*6;o.position.y-=ps*.2});
  scatter(rockGeo(rseed+300,16,.55),rkB,70,function(t){return t>0.02&&t<0.2},function(o){var ps=.11+rng()*.13;o.scale.set(ps*(1+rng()*.4),ps,ps*(1+rng()*.4));o.rotation.y=rng()*6;o.position.y-=ps*.15});

  // 사람
  var P=makePerson(), who=P.group;
  var px=Math.cos(ths)*rs*1.1, pz=Math.sin(ths)*rs*1.1;
  who.position.set(px,height(px,pz),pz); world.add(who);
  var handLog=add(P.elbR,LOG_G,M.wood,0,-.6,.04);handLog.rotation.y=.4;handLog.visible=false;
  var flyLog=add(world,LOG_G,emberMat(mat(0xa67c52,{roughness:.85,emissive:col(0xff8a24),emissiveIntensity:0}),true),0,0,0);flyLog.visible=false;
  var stG=new THREE.CylinderGeometry(.03,.022,1.45,8);stG.translate(0,-.72,0);var stick=add(P.elbR,stG,mat(0xc9b08a,{roughness:.95}),0,-.52,.02);stick.rotation.x=.75;stick.visible=false;var stickTip=new THREE.Object3D();stickTip.position.y=-1.45;stick.add(stickTip);
  // 게와 갈매기
  if(!WHALE){WHALE=makeWhale();scene.add(WHALE.g);scene.add(WHALE.blow)}WHALE.g.visible=false;
  if(!DOLPHS){DOLPHS=[];for(var dn=0;dn<9;dn++){var DM=makeDolphin();scene.add(DM.g);DOLPHS.push(DM)}}DOLPHS.forEach(function(m){m.g.visible=false});
  var crabs=[],gulls=[];
  for(var cb=0;cb<6;cb++){var ca2=rng()*6.283,ch=.45+rng()*.35,cd=radiusAt(ca2)*(1-ch/0.9*0.22),csc=(.38+rng()*.3)*.5,CM=makeCrab(CRAB_PAL[cb%5],csc);world.add(CM.g);
    crabs.push({m:CM,sc:csc,x:Math.cos(ca2)*cd,z:Math.sin(ca2)*cd,yaw:rng()*6.283,mode:'idle',timer:rng()*5,wp:0,cl:0,tx:0,tz:0})}
  // 꽃게 무리: 혼자 다니는 어른, 어른 둘이 함께 다니는 짝, 어른 하나나 둘에 딸린 새끼 1~3마리, 새끼끼리만 다니는 무리가 섞여 있다.
  // 새끼는 어미보다 연하고 바랜 색. 따라다니는 게(par)는 저마다 다른 거리(fr)를 두고, 그보다 멀어지면(leash) 쫓아간다. 섬 생김새가 바뀌지 않게 따로 뽑는다
  var babies=[],cr_=mulberry32(seed*31+5);
  function babyPal(pi){return CRAB_PAL[pi%5].map(function(h){return new THREE.Color(h).lerp(new THREE.Color(0xf2e4d0),.4).getHex()})}
  function addBaby(pal,par,x,z){var bsc=.06+cr_()*.035,BM=makeCrab(pal,bsc),bo=cr_()*6.283,br=.3+cr_()*.4;world.add(BM.g);
    var B={m:BM,sc:bsc,par:par,x:x+Math.cos(bo)*br,z:z+Math.sin(bo)*br,yaw:cr_()*6.283,mode:'idle',timer:cr_()*4,wp:0,cl:0,tx:0,tz:0,ft:cr_()*3,fr:.25+cr_()*.45,leash:.9+cr_()*.7};babies.push(B);return B}
  // 어른 짝: 앞 게가 혼자면 셋에 하나꼴로 뒤 게가 그 곁에 붙는다
  for(var ci=1;ci<crabs.length;ci++){var P0=crabs[ci-1];if(!P0.par&&!P0.mate&&cr_()<.35){var Q=crabs[ci],qa=cr_()*6.283,qr=.5+cr_()*.6;Q.par=P0;P0.mate=Q;Q.x=P0.x+Math.cos(qa)*qr;Q.z=P0.z+Math.sin(qa)*qr;Q.ft=cr_()*3;Q.fr=.5+cr_()*.7;Q.leash=1.6+cr_()*.9}}
  // 새끼: 혼자인 어른은 0~3마리, 짝은 0~2마리. 짝이면 둘 중 아무나 따라간다
  crabs.forEach(function(A,ai){if(A.par)return;var r=cr_(),nb=A.mate?(r<.45?0:r<.8?1:2):(r<.4?0:r<.6?1:r<.85?2:3),pal=babyPal(ai);
    for(var bi=0;bi<nb;bi++){var pr=A.mate&&cr_()<.5?A.mate:A;addBaby(pal,pr,pr.x,pr.z)}});
  // 새끼끼리만 다니는 무리 1~2개: 앞장선 새끼 하나를 나머지 1~3마리가 따라간다
  for(var gi=0,ng=1+(cr_()<.5?1:0);gi<ng;gi++){var ga=cr_()*6.283,gh=.45+cr_()*.35,gd=radiusAt(ga)*(1-gh/0.9*0.22),gx=Math.cos(ga)*gd,gz=Math.sin(ga)*gd,pal2=babyPal(Math.floor(cr_()*5)),lead=addBaby(pal2,null,gx,gz);
    for(var fi=0,nf=1+Math.floor(cr_()*3);fi<nf;fi++)addBaby(pal2,lead,gx,gz)}
  var GULL_V=[{back:0xa3afb8,scale:1.2},{back:0xbcc6cc,scale:1.05},{back:0x8e99a2,scale:1.3,beak:0xf5c84a},{back:0x76818a,scale:1.15},{back:0xaab4bb,scale:.95,beak:0xe6c27a},{back:0x9aa5ae,scale:1.1}];
  // 둥지: 풀밭과 모래가 만나는 곳. 어미 한 마리가 자주 돌아오고 새끼 둘이 그 둘레를 다닌다
  for(var nt=0;nt<40;nt++){var na=rng()*6.283;if(Math.abs(wrapA(na-ths))<.6)continue;var nd=radiusAt(na)*(1-.8/0.9*0.22),nx=Math.cos(na)*nd,nz=Math.sin(na)*nd;if(Math.hypot(nx-px,nz-pz)>10)break}
  var nest={x:nx,z:nz},chicks=[];
  for(var ck=0;ck<2;ck++){var CK=makeChick(.9+rng()*.25);world.add(CK.g);chicks.push({m:CK,x:nx+(rng()-.5)*1.4,z:nz+(rng()-.5)*1.4,yaw:rng()*6.283,mode:'idle',timer:rng()*3,wp:0,peck:0,tx:0,tz:0})}
  // 셋째 새끼: 섬 생김새가 바뀌지 않게 따로 뽑는다
  {var ck_=mulberry32(seed*17+3),CK3=makeChick(.9+ck_()*.25);world.add(CK3.g);chicks.push({m:CK3,x:nx+(ck_()-.5)*1.4,z:nz+(ck_()-.5)*1.4,yaw:ck_()*6.283,mode:'idle',timer:ck_()*3,wp:0,peck:0,tx:0,tz:0})}
  for(var gb=0;gb<6;gb++){var GMk=makeGull(GULL_V[gb]);world.add(GMk.g);
    var bd={m:GMk,p:new V3(),yaw:rng()*6.283,pitch:0,roll:0,vy:0,yawR:0,spd:6,A:.5,fp:rng()*6,wi:.1,we:0,sw:0,wf:0,tw:0,br:0,cr:0,glide:false,gt:1,wp:0,fleeR:4,timer:0,walk:null,
      hy:0,hp:0,hr:0,hY:0,hP:0,hR:0,rt:99,at:rng()*2,ad:1,act:'look',l0:0,l1:0,fl:false};
    if(gb===0){bd.parent=true;bd.p.set(nx+1.1,height(nx+1.1,nz),nz);bd.mode='rest';bd.timer=30+rng()*30}
    else if(gb<4){var oa=rng()*6.283,or=R*(.8+rng()*.6);bd.p.set(Math.cos(oa)*or,15+rng()*8,Math.sin(oa)*or);bd.mode='fly';bd.orad=or;bd.oa=oa;bd.odir=gb%2?1:-1;bd.alt=14+rng()*10;bd.timer=8+rng()*20;bd.ospd=6+rng()*1.5}
    else{for(var tg2=0;tg2<20;tg2++){var la=rng()*6.283,lh=.5+rng()*.3,ld=radiusAt(la)*(1-lh/0.9*0.22),lx=Math.cos(la)*ld,lz=Math.sin(la)*ld;if(Math.hypot(lx-px,lz-pz)>9)break}
      bd.p.set(lx,height(lx,lz),lz);bd.mode='rest';bd.timer=10+rng()*30}
    bd.f=bd.lg=bd.mode==='rest'?1:0;bd.l0=bd.l1=bd.mode==='rest'?0:1.35;gulls.push(bd)}
  // 갈매기 수: 들어올 때마다 2~4마리. 둥지의 어미는 늘 있고 나머지는 무작위로 고른다(만드는 순서는 그대로라 섬 생김새는 바뀌지 않는다)
  {var keepN=2+Math.floor(Math.random()*3),rest_=gulls.slice(1);for(var gk=rest_.length-1;gk>0;gk--){var gj=Math.floor(Math.random()*(gk+1)),gt_=rest_[gk];rest_[gk]=rest_[gj];rest_[gj]=gt_}
    rest_.slice(keepN-1).forEach(function(bd){world.remove(bd.m.g)});gulls=[gulls[0]].concat(rest_.slice(0,keepN-1))}

  var marker=new THREE.Mesh(new THREE.RingGeometry(.38,.56,28),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,depthWrite:false}));
  marker.rotation.x=-Math.PI/2; marker.visible=false; marker.userData.noShadow=true; marker.renderOrder=4; world.add(marker);

  addOutline(P.group,.016);crabs.forEach(function(c){addOutline(c.m.g,.014)});babies.forEach(function(c){crabs.push(c)});gulls.forEach(function(b){addOutline(b.m.g,.009)});chicks.forEach(function(c){addOutline(c.m.g,.012)});addOutline(shelter,.02);piles.forEach(function(pl){addOutline(pl,.016)});
  world.children.forEach(function(o){if(o.isMesh&&(o.material===rkB||o.material===rkI))addOutline(o,.018)});
  world.traverse(function(o){if(o.isMesh&&!o.userData.noShadow){o.castShadow=true;o.receiveShadow=true}});

  var windObs=trees.map(function(T){return {x:T.x+T.lean*.35*Math.cos(T.ry),z:T.z-T.lean*.35*Math.sin(T.ry),r:.45}}).concat(bushes.map(function(B){return {x:B.x,z:B.z,r:.9*B.s}}),beachRocks.map(function(B){return {x:B.x,z:B.z,r:B.r}}));
  W={windObs:windObs,bushes:bushes,seed:seed,R:R,height:height,shore:shore,radiusAt:radiusAt,terrain:terrain,who:who,P:P,marker:marker,shelfBottles:shelfBottles,radioPos:radioPos,shelterAngle:ths,sea:0,seaRising:true,
     N:N,rad:rad,cs:cs,sn:sn,wetS:wetS,patches:patches,crabs:crabs,gulls:gulls,chicks:chicks,nest:nest,whale:{m:WHALE,active:false,next:45+rng()*30,NB:1600,pi:0,pool:Array.from({length:1600},function(){return {l:1}})},dolph:{active:false,next:25+rng()*35,list:[]},seats:seats,shelter:shelter,tent:{strips:tentStrips,rest:false},trees:treeObjs.concat(treeTrunks),stick:stick,stickTip:stickTip,sandAreas:[],handLog:handLog,flyLog:flyLog,fire:{pos:firePos,flames:flames,glow:glow,sparks:sparks,logM:logM},prints:prints,swash:new Float32Array(N+1),rec:new Float32Array(N+1).fill(-1),wet:new Float32Array(N+1).fill(-1)};

  state={t:T0,bottles:1,sent:0,beach:[],flying:[],nextAt:null,nextLetter:0,sampleOrder:shuffle(SAMPLES.length,rng),reported:{},target:null,
         yaw:Math.atan2(Math.cos(ths),Math.sin(ths))+.5,pitch:.42,dist:21,walk:0,throwT:0,fire:0,sit:'none',sitK:0,sitFire:false,sitBase:null,seatTarget:null,woodT:6,woodA:-1,released:false,boost:0,bigT0:T0+9,wx:Math.cos(windAngle(1)),wz:Math.sin(windAngle(1)),wnd:windStrength(seed,Date.now()),prints:[],printI:0,stepD:0,foot:1,rng:rng,firstRead:false};
  state.ths=ths;
  // 첫 편지는 이미 해변에 닿아 있다 (서버가 있으면 netSync가 서버의 병을 놓는다)
  if(!NET){addBeachBottle({kind:'rule',idx:0},ths+0.55,true);state.nextLetter=1}
  $('seed').textContent='#'+seed;
  syncShelf(); syncSit(); if(typeof syncWriteUI==='function'){WR.mode=null;WR.strokes=[];syncWriteUI()}
}
function shuffle(n,rng){var a=[];for(var i=0;i<n;i++)a.push(i);for(var j=n-1;j>0;j--){var k=Math.floor(rng()*(j+1));var t=a[j];a[j]=a[k];a[k]=t}return a}

// 유리병: 투명한 와인병 모양. 비스듬히 볼수록 유리가 진해 보이고, 안에는 끈으로 묶은 두루마리 편지와 모래가 조금 들어 있다
var glassMat=(function(){var m=mat(0xe8f4ee,{transparent:true,opacity:.22,roughness:.04,metalness:.1,emissive:col(0xbfeedd),emissiveIntensity:.05,side:THREE.DoubleSide,depthWrite:false});
  m.onBeforeCompile=function(sh){sh.fragmentShader=sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );','float gF=pow(1.-abs(dot(normalize(vViewPosition),normal)),2.2);gl_FragColor=vec4(outgoingLight+vec3(.25,.32,.3)*gF,min(1.,diffuseColor.a+gF*.6));')};return m})();
var corkMat=(function(){var c=document.createElement('canvas');c.width=c.height=64;var x=c.getContext('2d');x.fillStyle='#c19a6b';x.fillRect(0,0,64,64);var r=mulberry32(4);
  for(var i=0;i<260;i++){x.fillStyle='rgba('+(r()<.5?'120,84,50,':'225,195,150,')+(.25+r()*.4)+')';x.fillRect(r()*64,r()*64,1+r()*2.5,1+r()*2)}
  var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return new THREE.MeshStandardMaterial({map:t,roughness:1})})();
var paperMat=mat(0xf7f1e3,{roughness:.9}), twineMat=mat(0x6b4a33,{roughness:.9}), sandIn=mat(0xc9a877,{roughness:1});
var BOTTLE_G=(function(){var pr=[[0,0],[.15,0],[.168,.02],[.172,.06],[.172,.5],[.165,.56],[.14,.62],[.1,.68],[.068,.74],[.058,.8],[.056,.94],[.064,.955],[.066,.985],[.058,1.0]].map(function(p){return new THREE.Vector2(p[0],p[1])});
  var g=new THREE.LatheGeometry(pr,32);g.computeVertexNormals();return g})();
var SCROLL_G=(function(){var g=new THREE.CylinderGeometry(.045,.045,.46,16);return g})();
function makeBottle(withPaper){
  var g=new THREE.Group();
  if(withPaper){var sc=new THREE.Group();sc.position.set(.02,.27,0);sc.rotation.z=-.22;g.add(sc);
    add(sc,SCROLL_G,paperMat,0,0,0);var fl=add(sc,new THREE.BoxGeometry(.004,.44,.07),paperMat,.043,0,.03);fl.rotation.y=.5;
    var tw=add(sc,new THREE.TorusGeometry(.048,.006,6,18),twineMat,0,.02,0);tw.rotation.x=Math.PI/2;var tw2=add(sc,new THREE.TorusGeometry(.048,.006,6,18),twineMat,0,.045,0);tw2.rotation.set(Math.PI/2,.3,0);
    var sd=add(g,new THREE.SphereGeometry(.15,16,8,0,Math.PI*2,Math.PI*.55,Math.PI*.45),sandIn,0,.13,0);sd.scale.y=.9}
  var corkG=new THREE.CylinderGeometry(.062,.052,.17,14);add(g,corkG,corkMat,0,1.02,0);
  var body=new THREE.Mesh(BOTTLE_G,glassMat);body.renderOrder=7;g.add(body);
  g.scale.setScalar(.82);var o=new THREE.Group();o.add(g);return o;
}

// 반짝임: 네 갈래 흰 별빛. 캐릭터 가까이 있는 해변의 병에서 저마다 다른 박자로 반짝여 주울 수 있음을 알린다(밝은 모래 위에서도 보이게 더하지 않고 덮어 그린다)
var SPARK_TEX=(function(){var c=document.createElement('canvas');c.width=c.height=64;var x=c.getContext('2d');
  var g=x.createRadialGradient(32,32,0,32,32,14);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);
  [[62,3],[3,62],[30,2],[2,30]].forEach(function(q,i){var lg=x.createLinearGradient(i%2?32:32-q[0]/2,i%2?32-q[1]/2:32,i%2?32:32+q[0]/2,i%2?32+q[1]/2:32);
    lg.addColorStop(0,'rgba(255,255,255,0)');lg.addColorStop(.5,'rgba(255,255,255,'+(i<2?1:.6)+')');lg.addColorStop(1,'rgba(255,255,255,0)');
    x.save();if(i>1){x.translate(32,32);x.rotate(Math.PI/4);x.translate(-32,-32)}x.fillStyle=lg;x.fillRect(32-q[0]/2,32-q[1]/2,q[0],q[1]);x.restore()});
  return new THREE.CanvasTexture(c)})();
function addSparkles(b){b.spk=[];b.glow=0;
  for(var i=0;i<5;i++){var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:SPARK_TEX,color:0xfffaf0,transparent:true,opacity:0,depthWrite:false,fog:false}));
    sp.renderOrder=8;sp.visible=false;b.mesh.add(sp);b.spk.push({s:sp,p:.9+Math.random()*1.2,ph:Math.random()*5,n:-1})}}
// 캐릭터가 12m 안으로 오면 서서히 반짝이기 시작한다(8m에서 가장 밝다). 반짝임 하나가 사그라들면 병 표면의 다른 자리에서 다시 반짝인다
function updSparkles(b,dt,t,who){var d=Math.hypot(b.mesh.position.x-who.position.x,b.mesh.position.z-who.position.z),near=b.arrive>=1?1-smoothstep(8,12,d):0;
  b.glow+=(near-b.glow)*Math.min(1,dt*2);
  for(var i=0;i<b.spk.length;i++){var K=b.spk[i],u=(t+K.ph)/K.p,n=Math.floor(u),f=u-n;
    if(n!==K.n){K.n=n;var a=Math.random()*6.283;K.s.position.set(Math.cos(a)*.16,.1+Math.random()*.7,Math.sin(a)*.16)}
    var k=Math.pow(Math.sin(Math.PI*f),4)*b.glow;K.s.visible=k>.01;K.s.material.opacity=k;K.s.material.rotation=t*.5+i;K.s.scale.setScalar(.1+.34*k)}}
// 병 줍기: 해변의 병을 누르면 캐릭터가 그 곁(75cm)으로 걸어가 병 쪽을 보고 편지를 연다. 이미 곁이면 바로 연다
function goPick(b){var w=W.who,bx=b.mesh.position.x,bz=b.mesh.position.z,dx=w.position.x-bx,dz=w.position.z-bz,dl=Math.hypot(dx,dz)||1;
  W.marker.visible=false;
  if(dl<1.3){state.pickB=null;state.target=null;if(state.sit==='none')w.rotation.y=Math.atan2(-dx,-dz);readBottle(b);return}
  state.pickB=b;state.target={x:bx+dx/dl*.75,z:bz+dz/dl*.75}}
// 누른 자리에서 가장 가까운 병. 병은 가늘어 손가락으로 맞히기 어려우므로, 화면에 비친 병 둘레 넉넉한 범위 안이면 그 병으로 본다
var _pv=new V3(),_pu=new V3();
function bottleAt(cx,cy,r){var best=null,bd=1e9;
  for(var i=0;i<state.beach.length;i++){var b=state.beach[i];if(b.arrive<1)continue;
    _pv.copy(b.mesh.position);_pv.y+=.25;_pu.copy(_pv).addScaledVector(camera.up,.6);_pv.project(camera);_pu.project(camera);if(_pv.z>1||_pv.z<-1)continue;
    var sx=(_pv.x+1)/2*r.width+r.left,sy=(1-_pv.y)/2*r.height+r.top,rad=Math.hypot((_pu.x-_pv.x)/2*r.width,(_pu.y-_pv.y)/2*r.height),d=Math.hypot(sx-cx,sy-cy);
    if(d<Math.max(34,rad*1.3)&&d<bd){bd=d;best=b}}
  return best}
// 해변이 받을 수 있는 상한(3)에 드는 병. 비회원은 보내서 비울 수 없으므로 챙긴 병은 세지 않는다(서버 _total과 같다)
function total(){return (CAN_WRITE?state.bottles:0)+state.beach.length}
function addBeachBottle(letter,angle,instant){
  var s=W.shore(angle), m=makeBottle(true); m.scale.setScalar(1.3); m.rotation.z=1.45; m.rotation.y=angle;
  var b={letter:letter,x:s.x,z:s.z,angle:angle,mesh:m,arrive:instant?1:0,born:state.t,phase:Math.random()*6,tilt:.6+Math.random()*.3};
  addSparkles(b); world.add(m); state.beach.push(b); return b;
}
// 오프라인 해변에 다음으로 올 편지. 규칙 편지는 서버(_give_rules)와 같게 준다: 2번은 첫 편지를 보낸 뒤, 3번은 2번을 읽은 뒤에 오므로
// 편지를 보낼 수 없는 비회원(오프라인 포함)에게는 1번만 가고 그다음부터는 시연용 편지가 온다
function nextLetter(){
  var nRules=CAN_WRITE?RULES.length:1;
  if(state.nextLetter<nRules) return {kind:'rule',idx:state.nextLetter++};
  var n=state.nextLetter++ - nRules, tries=0, idx;
  do{ idx=state.sampleOrder[(n+tries)%SAMPLES.length]; tries++; }while(state.reported[idx]&&tries<=SAMPLES.length);
  return {kind:'sample',idx:idx};
}
// 바람 방향: 섬 시드와 실제 시각으로 정해진다(env.js)
function windAngle(){return envWind(W.seed,Date.now())}

/* ---------- 화면 요소 ---------- */
var toastT=0;
function toast(msg,sec){var el=$('toast');el.textContent=msg;el.classList.remove('off');toastT=sec||5}
// 오른쪽 아래 병 아이콘의 개수. 가득 찼을 때(3개)와 없을 때의 안내는 아이콘 설명(툴팁)으로 둔다
function syncShelf(){
  for(var i=0;i<3;i++)W.shelfBottles[i].visible=i<state.bottles;
  // 비회원은 병을 보내지 못하므로 가득 참(받기를 멈춤)이 없다. 챙긴 병 수만 보인다
  var box=$('bottles'),full=CAN_WRITE&&state.bottles>=3;$('bcount').textContent=String(state.bottles);box.classList.toggle('full',full);
  box.title=full?'병이 가득 찼습니다. 한 통을 보내기 전까지 바다는 아무것도 보내지 않습니다.':state.bottles<1?'병이 없습니다. 병편지가 닿기를 기다립니다.':'가진 병 '+state.bottles+'개'+(CAN_WRITE?'':' · 편지를 보내려면 가입해 주세요');
  box.setAttribute('aria-label',box.title)
}
var modalOpen=false;
function openSheet(html,cls){var s=$('sheet');s.className='sheet'+(cls?' '+cls:'');s.innerHTML=html;$('veil').hidden=false;modalOpen=true;state.target=null;W.marker.visible=false;s.scrollTop=0;s.focus()}
function closeSheet(){$('veil').hidden=true;modalOpen=false;canvas.focus();if(photoURL){URL.revokeObjectURL(photoURL);photoURL=null}}
/* ---------- 기념사진 ---------- */
// 사진찍기를 누르면 다음 프레임을 그린 직후 화면을 복사한다(WebGL 캔버스는 그린 직후에만 읽을 수 있다).
// 화면에 걸린 색 보정(캔버스 채도·대비 필터와 시간대 색 막 #grade)을 똑같이 입혀 보이는 그대로 담고, HUD는 넣지 않는다.
// 폴라로이드처럼 흰 테두리를 두르고, 아래 여백에 '섬 이름 (#시드번호)'와 '날짜 · 섬에서 N일째'를 넥슨 Lv1 고딕으로 적는다
var shotReq=false, photoURL=null;
$('photo').onclick=function(){if(saverOn||modalOpen)return;shotReq=true};
function takePhoto(){
  var W0=canvas.width,H0=canvas.height,pad=Math.round(Math.min(W0,H0)*.03),cap=Math.round(Math.max(120,Math.min(W0,H0)*.16));
  var c=document.createElement('canvas');c.width=W0+pad*2;c.height=H0+pad+cap;var x=c.getContext('2d');
  x.fillStyle='#f7f3ea';x.fillRect(0,0,c.width,c.height);
  x.save();x.filter=canvas.style.filter||'none';x.drawImage(canvas,pad,pad);x.restore();
  var ge=$('grade'),go=parseFloat(ge.style.opacity)||0;
  if(go>0){x.save();x.globalCompositeOperation='soft-light';x.globalAlpha=go;x.fillStyle=ge.style.background||'#ffb060';x.fillRect(pad,pad,W0,H0);x.restore()}
  x.strokeStyle='rgba(43,41,34,.12)';x.lineWidth=Math.max(1,pad*.04);x.strokeRect(pad,pad,W0,H0);
  var name=(($('iname')&&$('iname').textContent)||'무인도').trim(),seedT=$('seed').textContent,d=new Date(),p2=function(n){return(n<10?'0':'')+n};
  var ds=d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()),f1=Math.round(cap*.27),f2=Math.round(cap*.17),tx=pad+Math.round(pad*.2);
  x.textAlign='left';x.textBaseline='alphabetic';
  x.fillStyle='#2b2922';x.font='700 '+f1+"px 'NEXON Lv1 Gothic','Apple SD Gothic Neo',sans-serif";x.fillText(name+' ('+seedT+')',tx,H0+pad+cap*.46);
  x.fillStyle='#7a705c';x.font=f2+"px 'NEXON Lv1 Gothic','Apple SD Gothic Neo',sans-serif";x.fillText(ds+' · 섬에서 '+islandDay()+'일째',tx,H0+pad+cap*.78);
  // 셔터: 화면이 잠깐 하얗게 번쩍인다
  var fl=document.createElement('div');fl.className='flash';$('app').appendChild(fl);setTimeout(function(){fl.remove()},600);
  c.toBlob(function(blob){if(!blob)return;if(photoURL)URL.revokeObjectURL(photoURL);photoURL=URL.createObjectURL(blob);
    var fn='나홀로섬에-'+ds+'.png',file=null;try{file=new File([blob],fn,{type:'image/png'})}catch(e){}
    var canShare=!!(file&&navigator.canShare&&navigator.canShare({files:[file]}));
    openSheet('<p class="tag">기념사진</p><img class="photo" src="'+photoURL+'" alt="'+esc(name+' ('+seedT+') '+ds+' 섬에서 '+islandDay()+'일째')+'">'+
      '<div class="btns"><a class="btn primary" id="psave" href="'+photoURL+'" download="'+esc(fn)+'">저장</a>'+(canShare?'<button id="pshare" type="button">공유</button>':'')+'<button id="pclose" type="button">닫기</button></div>','photo');
    $('pclose').onclick=closeSheet;
    if(canShare)$('pshare').onclick=function(){navigator.share({files:[file],title:name}).catch(function(){})};
  },'image/png');
}
function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

// 편지함에 알린다: 회원 편지함은 서버에서 다시 세고, 비회원 편지함은 이번 접속에서 연 편지를 화면에만 모아 둔다(key로 같은 편지를 가린다)
function letterKey(L){return L.kind==='net'?'n'+L.id:(L.kind==='rule'?'r':'s')+L.idx}
function noteLetter(key,body,rule,remove){try{window.dispatchEvent(new CustomEvent('bottle-letters',{detail:{key:key,body:body,rule:rule,at:new Date().toISOString(),remove:!!remove}}))}catch(e){}}
function readBottle(b){
  sfx('bottle_pick');setTimeout(function(){sfx('cork',null,0,0,.6)},420);setTimeout(function(){sfx('paper',null,0,0,.55)},900);
  var L=b.letter;
  if(L.kind==='net'){
    openSheet('<p class="tag">코르크를 따는 중…</p>');
    NET.open(L.id).then(function(r){noteLetter(letterKey(L),r.body,r.kind==='rule'?r.rule:null);showLetter(b,r.kind==='rule'?'규칙 편지 '+r.rule+' / 3':'유리병 편지',r.body.split(/(?:\r?\n){2,}/))})
      .catch(function(e){closeSheet();toast(NET.message(e),5);if(e&&e.message==='not_here'){removeBeach(b);netSync()}});
    return;
  }
  var paras=(L.kind==='rule'?RULES:SAMPLES)[L.idx];noteLetter(letterKey(L),paras.join('\n\n'),L.kind==='rule'?L.idx+1:null);
  showLetter(b,L.kind==='rule'?'규칙 편지 '+(L.idx+1)+' / 3':'예시 편지 · 시연용으로 지어낸 글',paras);
}
// 서버 일을 하는 동안 버튼을 잠그고, 실패하면 알린다
function netDo(p,ok){var bs=$('sheet').querySelectorAll('button');bs.forEach(function(x){x.disabled=true});
  p.then(ok).catch(function(e){bs.forEach(function(x){x.disabled=false});toast(NET.message(e),5)})}
function showLetter(b,tag,paras){
  var L=b.letter;
  var html='<p class="tag">'+tag+'</p>'+paras.map(function(p){return'<p>'+esc(p)+'</p>'}).join('')+
    '<div class="btns" id="rb"><button class="primary" id="take" type="button">병을 챙긴다</button><button id="sink" type="button">병째 가라앉힌다 · 신고</button></div>';
  openSheet(html,'letter');
  function took(held){removeBeach(b);if(held==null)state.bottles++;else state.bottles=held;syncShelf();closeSheet();
    toast(state.firstRead?'병이 하나 늘었습니다.':CAN_WRITE?'병이 하나 늘었습니다. 해변에서 ‘편지를 쓴다’를 눌러 한 통 보내 보세요.':'병이 하나 늘었습니다. 편지를 보내려면 가입해 주세요.',6);state.firstRead=true}
  $('take').onclick=function(){if(L.kind==='net')netDo(NET.keep(L.id),took);else took()};
  $('sink').onclick=function(){
    $('rb').innerHTML='<button class="primary" id="sinkyes" type="button">가라앉힌다</button><button id="sinkno" type="button">돌아간다</button>'+
      '<p class="note" style="flex-basis:100%">이 편지를 신고하고 병째 가라앉힙니다. 병은 얻지 못하고, 이 편지는 다시 떠돌지 않습니다.</p>';
    function sunk(){noteLetter(letterKey(L),null,null,true);removeBeach(b);state.nextAt=state.t+10;closeSheet();toast('병이 가라앉았습니다.',4)}
    $('sinkyes').onclick=function(){if(L.kind==='net')netDo(NET.sink(L.id),sunk);else{if(L.kind==='sample')state.reported[L.idx]=true;sunk()}};
    $('sinkno').onclick=function(){closeSheet();showLetter(b,tag,paras)};
  };
}
function removeBeach(b){world.remove(b.mesh);var i=state.beach.indexOf(b);if(i>=0)state.beach.splice(i,1)}

function writeLetter(){
  if(!CAN_WRITE){toast('편지는 가입한 회원만 보낼 수 있습니다. 지금은 받은 편지를 읽을 수만 있어요.',5);return}
  sfx('paper',null,0,0,.45);
  if(state.bottles<1) return;
  openSheet('<h2>병에 담을 편지</h2>'+
    '<textarea id="letter-text" maxlength="300" placeholder="누구에게 닿을지 모르는 편지를 씁니다."></textarea>'+
    '<div class="count"><span id="lc">0</span> / 300</div>'+
    '<p class="err" id="lerr" role="alert"></p>'+
    '<div class="btns"><button class="primary" id="throw" type="button">병에 담아 던진다</button><button id="cancel" type="button">그만둔다</button></div>'+
    '<p class="note">닿았는지, 읽혔는지는 알 수 없습니다. 답장도 오지 않습니다.</p>');
  var ta=$('letter-text'); ta.focus();
  ta.oninput=function(){$('lc').textContent=ta.value.length;$('lerr').textContent=''};
  $('cancel').onclick=closeSheet;
  $('throw').onclick=function(){
    var v=ta.value.trim();
    if(v.length<5){$('lerr').textContent='편지가 너무 짧습니다. 다섯 글자 이상 적어 주세요.';return}
    if(hasContact(v)){$('lerr').textContent='이름이나 연락할 방법이 적힌 글은 병에 들어가지 않습니다. 그 부분을 지워 주세요.';return}
    if(!NET){closeSheet();throwBottle();return}
    var bt=$('throw');bt.disabled=true;bt.textContent='병에 담는 중…';
    NET.throw(v).then(function(r){closeSheet();throwBottle(r.held)})
      .catch(function(e){bt.disabled=false;bt.textContent='병에 담아 던진다';$('lerr').textContent=NET.message(e)});
  };
}
function throwBottle(held){
  sfx('throw',null,0,0,.75);
  if(held==null)state.bottles--;else state.bottles=held; state.sent++; syncShelf();
  var p=W.who.position, a=Math.atan2(p.z,p.x), s=W.shore(a), m=makeBottle(true); m.scale.setScalar(1.5); world.add(m);
  state.flying.push({mesh:m,t:0,fx:p.x,fz:p.z,fy:p.y+2.6,tx:Math.cos(a)*(s.d+9),tz:Math.sin(a)*(s.d+9),ox:Math.cos(a),oz:Math.sin(a)});
  W.who.rotation.y=Math.atan2(Math.cos(a),Math.sin(a)); state.throwT=.45;
  toast('병이 떠내려갑니다. 누군가에게 반드시 닿습니다. 닿았는지는 알 수 없습니다.',7);
  if(state.nextAt===null||state.nextAt-state.t>12) state.nextAt=state.t+12;
}
// 라디오 방송 주소: NEXT_PUBLIC_RADIO_URL(HLS)이 있으면 그것을, 없으면 서버(/api/radio)가 재생 목록(.pls)에서 읽어 준 주소를 쓴다.
// 재생 목록의 방송 주소는 하루쯤 지나면 만료되므로 켤 때마다 새로 받는다
var RADIO={name:'라디오',url:process.env.NEXT_PUBLIC_RADIO_URL||'',title:''};
function radioSrc(cb){if(RADIO.url)return cb(RADIO.url);
  fetch('/api/radio',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.url){RADIO.title=j.title||'';cb(j.url)}else cb(null)}).catch(function(){cb(null)})}
var radio={on:false,audio:null,hls:null,spatial:(function(){try{return localStorage.getItem('bottle-island-rsp')!=='0'}catch(e){return true}})()};
function loadHls(cb){if(window.Hls)return cb();var sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js';sc.onload=function(){cb()};sc.onerror=function(){cb(new Error('hls'))};document.head.appendChild(sc)}
function radioStatus(t){var el=$('rstat');if(el)el.textContent=t}
function updRadioBtn(){var cb=$('setradio');if(cb)cb.checked=radio.on;syncVol('setrv',rLv,radio.on);var bt=$('rplay');if(bt){bt.setAttribute('aria-pressed',String(radio.on));bt.textContent=radio.on?RADIO.name+' 끄기':RADIO.name+' 듣기'}}
function radioStop(){radio.on=false;if(radio.hls){radio.hls.destroy();radio.hls=null}if(radio.audio){radio.audio.pause();radio.audio.removeAttribute('src');try{radio.audio.load()}catch(e){}}updRadioBtn()}
function radioFail(msg){radioStop();radioStatus(msg||'치직… 치지직… 방송이 잡히지 않습니다.')}
function radioPlay(){
  radio.on=true;updRadioBtn();radioStatus('주파수를 맞추는 중…');sfx('radio_tune',W.radioPos.x,W.radioPos.y+.15,W.radioPos.z,.5);
  if(!radio.audio){radio.audio=new Audio();radio.audio.crossOrigin='anonymous';radio.audio.disableRemotePlayback=true;radio.audio.setAttribute('playsinline','')}
  var a=radio.audio; initAudio(); radioGraph(a); try{var pp=a.play();if(pp&&pp.catch)pp.catch(function(){})}catch(e){} // 누른 순간 재생 권한을 잡아 둔다(iOS)
  // 어떤 길로 재생되는지 상태 줄에 함께 적는다(모바일에서 공간 효과가 빠지는 원인을 찾기 위함)
  // iPhone·iPad의 모든 브라우저(WebKit)는 방송 소리를 Web Audio로 넘겨주지 않아, 연결은 돼도 효과가 실제로 걸리지 않는다
  var fx=radioFx;
  function start(){a.play().then(function(){radioStatus((RADIO.title||RADIO.name)+' 듣는 중'+fx())}).catch(function(er){if(er&&er.name==='NotAllowedError')radioStatus('재생이 막혔습니다. 한 번 더 눌러 주세요.')})}
  // iOS 사파리의 기본 HLS 재생은 Web Audio를 거치지 않아 공간 효과가 빠진다. 그래서 hls.js(iOS 17.1+의 ManagedMediaSource)를 먼저 쓴다
  radioSrc(function(SRC){if(!radio.on)return;if(!SRC){radioFail('치직… 치지직… 아직 잡히는 방송이 없습니다.');return}
  loadHls(function(err){if(!radio.on)return;
    if(err||!window.Hls||!Hls.isSupported()){radio.mode='기본 재생: '+(err?'hls.js 못 불러옴':'hls.js 미지원');if(a.canPlayType('application/vnd.apple.mpegurl')){a.onerror=function(){radioFail()};a.src=SRC;start()}else radioFail('이 브라우저에서는 방송을 들을 수 없습니다.');return}
    radio.mode='hls';var h=radio.hls=new Hls({manifestLoadingMaxRetry:1,levelLoadingMaxRetry:2,fragLoadingMaxRetry:2});
    h.on(Hls.Events.ERROR,function(e,d){if(!d.fatal||radio.hls!==h)return;h.destroy();radio.hls=null;radio.mode='기본 재생: hls.js 오류 '+(d.details||d.type);
      // hls.js가 안 되면 기본 재생으로라도 튼다(이때는 공간 효과가 빠질 수 있다)
      if(radio.on&&a.canPlayType('application/vnd.apple.mpegurl')){a.onerror=function(){radioFail()};a.src=SRC;start()}else radioFail()});
    h.loadSource(SRC);h.attachMedia(a);start()})});
}
// ── 소리: 섬의 바다·바람·비 소리와, 라디오 스피커에서 나오는 방송을 공간에 놓는다 ──
// 귀는 캐릭터 머리에 두고 카메라가 보는 쪽을 앞으로 삼는다. 첫 클릭·키 입력 때 켜진다(브라우저 규칙).
var AU=null, soundOn=(function(){try{return localStorage.getItem('bottle-island-bg')!=='0'}catch(e){return true}})(); // soundOn: 배경음(바다·바람·비·불·새·발소리 등) 켬
// 소리 크기 3단계(저·중·고). 배경음과 라디오를 따로 정하고 브라우저에 기억해 둔다
var VOLS=[.35,.65,1];function volLv(k){try{var v=parseInt(localStorage.getItem(k),10);return v>=0&&v<=2?v:1}catch(e){return 1}}
var bgLv=volLv('bottle-island-bgvol'),rLv=volLv('bottle-island-rvol');
function initAudio(){
  if(AU){if(AU.ctx.state!=='running')AU.ctx.resume();return AU}
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  var ctx=new AC(),sr=ctx.sampleRate;
  function buf(kind){var n=sr*6,b=ctx.createBuffer(1,n,sr),d=b.getChannelData(0),l=0;for(var i=0;i<n;i++){var w=Math.random()*2-1;if(kind==='brown'){l=(l+.02*w)/1.02;d[i]=l*3.2}else d[i]=w*.6}return b}
  function loop(b){var sc=ctx.createBufferSource();sc.buffer=b;sc.loop=true;sc.loopStart=Math.random()*2;sc.start(0,Math.random()*5);return sc}
  function filt(type,f,q){var x=ctx.createBiquadFilter();x.type=type;x.frequency.value=f;if(q)x.Q.value=q;return x}
  function gain(v){var g=ctx.createGain();g.gain.value=v;return g}
  function pan(ref,roll){var p=ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=ref;p.rolloffFactor=roll;p.maxDistance=400;return p}
  var master=gain(1);master.connect(ctx.destination);var amb=gain(soundOn?VOLS[bgLv]:0);amb.connect(master);
  var white=buf('white'),brown=buf('brown');
  // 가까운 해안의 파도: 웅웅대는 몸통 + 부서지는 거품. 해안선 위 가장 가까운 점에 놓는다
  var wP=pan(5,1),wBody=filt('lowpass',700,.5),wBG=gain(0),wFoam=filt('bandpass',2600,.6),wFG=gain(0);
  loop(brown).connect(wBody);wBody.connect(wBG);wBG.connect(wP);loop(white).connect(wFoam);wFoam.connect(wFG);wFG.connect(wP);wP.connect(amb);
  // 섬을 둘러싼 먼 바다: 방향 없이 낮게 깔린다
  var far=filt('lowpass',380,.4),farG=gain(.05);loop(brown).connect(far);far.connect(farG);farG.connect(amb);
  // 바람과 비
  var wind=filt('bandpass',500,.7),windG=gain(0);loop(white).connect(wind);wind.connect(windG);windG.connect(amb);
  var rain=filt('highpass',2200,.5),rainG=gain(0);loop(white).connect(rain);rain.connect(rainG);rainG.connect(amb);
  AU={ctx:ctx,master:master,amb:amb,gain:gain,filt:filt,pan:pan,wP:wP,wBody:wBody,wBG:wBG,wFG:wFG,wind:wind,windG:windG,rainG:rainG,farG:farG,radio:null,prevSw:0,env:0,smp:{},gullT:6};
  loadSounds();loadSfx();
  return AU}
// ElevenLabs로 만든 녹음 소리(public/sounds/*.mp3, manifest.json에 적힌 것만). 파일이 있으면 합성 소리 대신 쓰고, 없으면 합성 소리 그대로 둔다
var SOUND_FILES={waves:'waves.mp3',wind:'wind.mp3',rain:'rain.mp3',fire:'fire.mp3',gulls:'gulls.mp3'};
var SOUND_LIST=null;
function soundList(){if(!SOUND_LIST)SOUND_LIST=fetch('/sounds/manifest.json').then(function(r){return r.ok?r.json():[]}).catch(function(){return []});return SOUND_LIST}
function loadSounds(){var c=AU.ctx;soundList().then(function(have){Object.keys(SOUND_FILES).forEach(function(k){if(have.indexOf(SOUND_FILES[k])<0)return;
  fetch('/sounds/'+SOUND_FILES[k]).then(function(r){if(!r.ok)throw 0;return r.arrayBuffer()}).then(function(ab){return new Promise(function(res,rej){c.decodeAudioData(ab,res,rej)})}).then(function(buf){
    var S=AU.smp;S[k]={buf:buf};
    if(k==='gulls'){S.gulls.p=AU.pan(8,1);S.gulls.p.connect(AU.amb);return}
    var sc=c.createBufferSource();sc.buffer=buf;sc.loop=true;var g=AU.gain(0);sc.connect(g);sc.start(0,Math.random()*buf.duration);S[k].g=g;
    if(k==='waves'){g.connect(AU.wP);setP(AU.wBG.gain,0,c.currentTime,.3);setP(AU.wFG.gain,0,c.currentTime,.3)}
    else if(k==='fire'){S.fire.p=AU.pan(1.6,1.3);g.connect(S.fire.p);S.fire.p.connect(AU.amb)}
    else g.connect(AU.amb);
  }).catch(function(){})})})}
// 작은 플라스틱 스피커: 저음·고음을 깎고 중음을 살짝 올려 조금 찌그러뜨린 모노 소리
// 행동·개체 효과음(ElevenLabs). 같은 소리의 여러 테이크(_1~_4)를 섞어 틀어 반복이 덜 느껴지게 한다
var SFX_NAMES=['step_sand','step_wet','step_grass','step_water','log','thunder','bottle_pick','cork','paper','throw','sand_write','crab','whale','sit','radio_tune'];
function loadSfx(){var c=AU.ctx;AU.sfx={};soundList().then(function(have){SFX_NAMES.forEach(function(n){AU.sfx[n]=[];['','_1','_2','_3','_4'].forEach(function(suf){if(have.indexOf(n+suf+'.mp3')<0)return;
  fetch('/sounds/'+n+suf+'.mp3').then(function(r){if(!r.ok)throw 0;return r.arrayBuffer()}).then(function(ab){return new Promise(function(res,rej){c.decodeAudioData(ab,res,rej)})}).then(function(b){AU.sfx[n].push(b)}).catch(function(){})})})})}
// x가 있으면 그 자리에서(공간), 없으면 귀 바로 앞에서 들린다. ref는 소리가 줄기 시작하는 거리
function sfx(name,x,y,z,vol,rate,ref){if(!AU||!soundOn||!AU.sfx)return null;var L=AU.sfx[name];if(!L||!L.length)return null;var c=AU.ctx;
  var sc=c.createBufferSource();sc.buffer=L[Math.floor(Math.random()*L.length)];sc.playbackRate.value=rate||(.94+Math.random()*.12);
  var g=AU.gain(vol==null?.7:vol);sc.connect(g);
  if(c.state!=='running')c.resume();
  if(x!=null){var pn=AU.pan(ref||2,1.1);if(pn.positionX){pn.positionX.value=x;pn.positionY.value=y||0;pn.positionZ.value=z}else pn.setPosition(x,y||0,z);g.connect(pn);pn.connect(AU.amb)}else g.connect(AU.amb);
  sc.start();return sc}
function stepSfx(x,z){if(!AU)return;var dp=waterDepth(x,z),h=W.height(x,z),fp=W.fire.pos,name;
  if(dp>.025)name='step_water';else if(W.swash[binOf(x,z)]+.3>h)name='step_wet';else if(h>1.15&&Math.hypot(x-fp.x,z-fp.z)>6)name='step_grass';else name='step_sand';
  sfx(name,x,h,z,name==='step_water'?.6:.42)}
function radioGraph(a){
  if(!AU||AU.radio)return;var c=AU.ctx;
  try{var src=c.createMediaElementSource(a)}catch(e){return}
  var hp=AU.filt('highpass',180,.8),pk=AU.filt('peaking',1600,1.1),lp=AU.filt('lowpass',4800,.7),air=AU.filt('lowpass',9000,.5),sh=c.createWaveShaper(),g=AU.gain(.9),p=AU.pan(2.2,1.15);
  pk.gain.value=4.5;var cv=new Float32Array(1024);for(var i=0;i<1024;i++){var x=i/511.5-1;cv[i]=Math.tanh(1.8*x)/Math.tanh(1.8)}sh.curve=cv;
  // 공간음향: 작은 스피커 음색 → 바람에 흔들림 → 거리만큼 먹먹해짐 → 라디오 자리에서 들림. 끄면 섬 어디서든 같은 크기로 깨끗하게 들린다
  var gS=AU.gain(radio.spatial?1:0),gU=AU.gain(radio.spatial?0:.85),rv=AU.gain(VOLS[rLv]);rv.connect(AU.master);
  src.connect(hp);hp.connect(pk);pk.connect(lp);lp.connect(sh);sh.connect(g);g.connect(air);air.connect(p);p.connect(gS);gS.connect(rv);
  src.connect(gU);gU.connect(rv);
  AU.radio={g:g,air:air,p:p,gS:gS,gU:gU,rv:rv}}
function setRadioSpatial(on){radio.spatial=on;try{localStorage.setItem('bottle-island-rsp',on?'1':'0')}catch(e){}
  if(AU&&AU.radio){var ct=AU.ctx.currentTime;setP(AU.radio.gS.gain,on?1:0,ct,.12);setP(AU.radio.gU.gain,on?0:.85,ct,.12)}
  if(radio.on)radioStatus((RADIO.title||RADIO.name)+' 듣는 중'+radioFx());syncSet()}
// 상태 줄에 붙이는 소리 길 설명. iPhone·iPad(WebKit)는 방송 소리를 Web Audio로 넘겨주지 않아 공간음향이 걸리지 않는다
function radioFx(){var IOS=/iP(hone|ad|od)/.test(navigator['user'+'Agent'])||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!radio.spatial)return ' · 공간음향 꺼짐';if(IOS)return ' · 공간음향 없음(iOS 제한)';
  var ok=radio.mode==='hls'&&AU&&AU.radio&&AU.ctx.state==='running';return ok?' · 공간음향 켜짐':' · 공간음향 없음('+(radio.mode==='hls'?'오디오 '+(AU?AU.ctx.state:'없음'):radio.mode)+')'}
function setP(prm,v,t,k){if(prm.setTargetAtTime)prm.setTargetAtTime(v,t,k);else prm.value=v}
function placeNode(node,x,y,z,t){if(node.positionX){setP(node.positionX,x,t,.05);setP(node.positionY,y,t,.05);setP(node.positionZ,z,t,.05)}else node.setPosition(x,y,z)}
var _fw=new THREE.Vector3();
function updAudio(dt,t){
  if(!AU)return;var c=AU.ctx,ct=c.currentTime,who=W.who,L=c.listener;
  var hx=who.position.x,hy=who.position.y+1.6,hz=who.position.z;
  camera.getWorldDirection(_fw);_fw.y=0;if(_fw.lengthSq()<1e-6)_fw.set(0,0,-1);_fw.normalize();
  if(L.positionX){setP(L.positionX,hx,ct,.05);setP(L.positionY,hy,ct,.05);setP(L.positionZ,hz,ct,.05);setP(L.forwardX,_fw.x,ct,.05);setP(L.forwardY,0,ct,.05);setP(L.forwardZ,_fw.z,ct,.05);L.upX.value=0;L.upY.value=1;L.upZ.value=0}
  else{L.setPosition(hx,hy,hz);L.setOrientation(_fw.x,0,_fw.z,0,1,0)}
  // 파도: 가장 가까운 해안선 점에서, 물이 밀려 올라올 때 커진다
  var th=Math.atan2(hz,hx),rr=W.radiusAt(th),bin=binOf(hx,hz),sw=W.swash[bin]||0,rise=Math.max(0,(sw-AU.prevSw)/Math.max(dt,1e-3));AU.prevSw=sw;
  AU.env+=(Math.min(1,.35+rise*1.4)-AU.env)*Math.min(1,dt*(rise>0?4:1.2));
  var big=.6+WX.wind*.5+WX.storm*.5;
  placeNode(AU.wP,Math.cos(th)*rr,0.2,Math.sin(th)*rr,ct);var S=AU.smp;
  if(S.waves&&S.waves.g)setP(S.waves.g.gain,(.55+.45*AU.env)*big*.9,ct,.2);
  else{setP(AU.wBG.gain,.55*AU.env*big,ct,.12);setP(AU.wFG.gain,.16*AU.env*AU.env*big,ct,.1);setP(AU.wBody.frequency,450+700*AU.env,ct,.15)}
  setP(AU.farG.gain,.04+.05*WX.wind+.05*WX.storm,ct,.5);
  // 바람: 세기에 따라 커지고, 돌풍에 높낮이가 흔들린다
  var gust=.5+.5*Math.sin(t*.37)*Math.sin(t*.91+1.3);
  var windV=(.012+WX.wind*WX.wind*.16)*(.6+.6*gust);
  if(S.wind&&S.wind.g){setP(S.wind.g.gain,windV*3.2,ct,.3);setP(AU.windG.gain,0,ct,.3)}else{setP(AU.windG.gain,windV,ct,.3);setP(AU.wind.frequency,320+WX.wind*500+gust*220,ct,.3)}
  if(S.rain&&S.rain.g){setP(S.rain.g.gain,WX.rain*.55,ct,.4);setP(AU.rainG.gain,0,ct,.4)}else setP(AU.rainG.gain,WX.rain*.13,ct,.4);
  // 모닥불: 불 자리에서 타닥거리고, 불이 꺼지면 함께 잦아든다
  if(S.fire&&S.fire.g){var fp=W.fire.pos;placeNode(S.fire.p,fp.x,fp.y+.3,fp.z,ct);setP(S.fire.g.gain,Math.min(1,waterU.uFireI.value)*.8,ct,.3)}
  // 갈매기: 낮에 이따금, 날고 있는 갈매기 한 마리 자리에서 운다
  AU.gullT-=dt;if(AU.gullT<=0){AU.gullT=14+Math.random()*30;
    if(S.gulls&&S.gulls.buf&&sunE()>.15&&WX.rain<.5&&W.gulls.length){var gb=W.gulls[Math.floor(Math.random()*W.gulls.length)].p;placeNode(S.gulls.p,gb.x,(gb.y||6),gb.z,ct);
      var one=c.createBufferSource();one.buffer=S.gulls.buf;one.playbackRate.value=.92+Math.random()*.16;var og=AU.gain(.55);one.connect(og);og.connect(S.gulls.p);one.start()}}
  // 모래에 막대로 새기는 동안 긁는 소리를 이어서 낸다
  var carving=WR.mode==='engrave'&&WR.phase==='carve';
  if(carving&&!AU.carve&&AU.sfx&&AU.sfx.sand_write.length){var cs=c.createBufferSource();cs.buffer=AU.sfx.sand_write[0];cs.loop=true;var cg=AU.gain(0);cs.connect(cg);cg.connect(AU.amb);cs.start();AU.carve={s:cs,g:cg}}
  if(AU.carve){setP(AU.carve.g.gain,carving&&soundOn?.45:0,ct,.08);if(!carving&&!AU.carve.off){AU.carve.off=true;var cv=AU.carve;setTimeout(function(){try{cv.s.stop()}catch(e){}},400);AU.carve=null}}
  // 라디오: 스피커 자리에서 나오고, 멀어지면 고음부터 흐려지며, 센 바람에 소리가 실려 흔들린다
  if(AU.radio){var rp=W.radioPos,d=Math.hypot(rp.x-hx,rp.z-hz);placeNode(AU.radio.p,rp.x,rp.y+.15,rp.z,ct);
    setP(AU.radio.air.frequency,Math.max(1100,9000/(1+d*.09)),ct,.2);
    setP(AU.radio.g.gain,.9*(1-.3*WX.wind*(.5+.5*Math.sin(t*1.7)*Math.sin(t*.63+.4))),ct,.15)}
}
function setSound(on){soundOn=on;try{localStorage.setItem('bottle-island-bg',on?'1':'0')}catch(e){}var b=$('setbg');if(b)b.checked=on;syncVol('setbgv',bgLv,on);if(AU)setP(AU.amb.gain,on?VOLS[bgLv]:0,AU.ctx.currentTime,.08)}
function setBgVol(lv){bgLv=lv;try{localStorage.setItem('bottle-island-bgvol',String(lv))}catch(e){}if(AU)setP(AU.amb.gain,soundOn?VOLS[lv]:0,AU.ctx.currentTime,.08);syncSet()}
function setRadioVol(lv){rLv=lv;try{localStorage.setItem('bottle-island-rvol',String(lv))}catch(e){}if(AU&&AU.radio)setP(AU.radio.rv.gain,VOLS[lv],AU.ctx.currentTime,.08);syncSet()}
// 브라우저는 사용자의 탭·클릭 안에서만 소리를 켜 준다. iOS 사파리는 pointerdown이 아니라 touchend·click에서만 허락하므로
// 여러 입력에서 시도하고, 실제로 켜질 때까지 리스너를 남겨 둔다. 무음 스위치가 켜져 있어도 들리도록 재생 세션으로 둔다.
var AUDIO_EVTS=['pointerdown','pointerup','touchend','click','keydown'];
function audioKick(){
  try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}
  var A=initAudio();if(!A)return;var c=A.ctx;
  if(!A.unlocked){A.unlocked=true;try{var sb=c.createBufferSource();sb.buffer=c.createBuffer(1,1,22050);sb.connect(c.destination);sb.start(0)}catch(e){}}
  var p=c.state!=='running'?c.resume():null;
  var done=function(){if(c.state==='running')AUDIO_EVTS.forEach(function(ev){window.removeEventListener(ev,audioKick,true)})};
  if(p&&p.then)p.then(done,function(){});else done()}
AUDIO_EVTS.forEach(function(ev){window.addEventListener(ev,audioKick,true)});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&AU&&AU.ctx.state!=='running')AU.ctx.resume()});
// 라디오는 방송을 듣는 용도로만 쓴다 (날씨·물때·병 소식은 전하지 않는다)
function listenRadio(){
  openSheet('<p class="tag">라디오</p>'+'<div class="btns"><button id="rplay" type="button" class="rch" aria-pressed="false"></button></div><p class="rstat" id="rstat" aria-live="polite"></p>'+
    '<div class="btns"><button id="rclose" type="button" class="primary">닫기</button></div>','radio');
  updRadioBtn();radioStatus(radio.on?(RADIO.title||RADIO.name)+' 듣는 중'+radioFx():'');
  $('rplay').onclick=function(){if(radio.on){radioStop();radioStatus('')}else radioPlay()};
  $('rclose').onclick=closeSheet;
}
$('veil').addEventListener('pointerdown',function(ev){if(ev.target===this&&!$('letter-text'))closeSheet()});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&modalOpen)closeSheet()});
/* ---------- 모래글쓰기: 위에서 내려다보며 획을 긋고, 캐릭터가 막대로 그 획을 따라 모래에 새긴다 ---------- */
var WR={mode:null,strokes:[],cur:null,camK:0,center:new V3(),face:new V3(0,0,1),si:0,pi:0,tip:null,phase:null,tgt:null,len:0};
var WR_MAXPTS=1400;
var wrLine=(function(){var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(WR_MAXPTS*2*3),3));g.setDrawRange(0,0);
  var L=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xfffbf0,transparent:true,opacity:.95,depthTest:false,depthWrite:false}));L.frustumCulled=false;L.renderOrder=20;L.visible=false;scene.add(L);return L})();
var wrRing=(function(){var m=new THREE.Mesh(new THREE.RingGeometry(5.3,5.42,64),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.35,depthTest:false,depthWrite:false}));m.rotation.x=-Math.PI/2;m.renderOrder=19;m.visible=false;scene.add(m);return m})();
function wrRebuild(){var a=wrLine.geometry.attributes.position.array,n=0,eng=WR.mode==='engrave'&&WR.phase==='carve';
  WR.strokes.forEach(function(st,si){if(eng&&si<WR.si)return;var i0=eng&&si===WR.si?WR.pi:1;for(var i=i0;i<st.length&&n<WR_MAXPTS;i++){var A=(eng&&si===WR.si&&i===i0)?WR.tip:st[i-1],B=st[i];a[n*6]=A.x;a[n*6+1]=A.y+.06;a[n*6+2]=A.z;a[n*6+3]=B.x;a[n*6+4]=B.y+.06;a[n*6+5]=B.z;n++}});
  wrLine.geometry.attributes.position.needsUpdate=true;wrLine.geometry.setDrawRange(0,n*2);WR.len=n}
// 모래에 쓴 글씨: 쓸 자리마다 높이 지도(캔버스)를 하나 두고, 막대가 지나간 자리를 손가락으로 그은 듯한 넓고 둥근 홈으로 판다.
// 화면에서는 이 높이 지도로 경사를 계산해, 빛을 받는 안쪽 벽은 밝게, 반대쪽 벽과 바닥은 그늘지게 칠하고 가장자리에는 부스러진 모래알을 흩뿌린다.
// 모래 색에 곱하거나 더하는 방식이라 젖은 모래, 마른 모래, 낮과 밤 어디서든 그 자리 모래 색을 그대로 따른다
var SAND_SZ=11,SAND_PX=512,SAND_CELLS=24,grooveU={uL:{value:new V3(0,1,0)}};
function makeSandArea(cx,cz){
  var cv=document.createElement('canvas');cv.width=cv.height=SAND_PX;var cx2=cv.getContext('2d');cx2.fillStyle='#000';cx2.fillRect(0,0,SAND_PX,SAND_PX);
  var tex=new THREE.CanvasTexture(cv);tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
  var geo=new THREE.PlaneGeometry(SAND_SZ,SAND_SZ,64,64);geo.rotateX(-Math.PI/2);var p=geo.attributes.position;
  for(var i=0;i<p.count;i++)p.setY(i,W.height(p.getX(i)+cx,p.getZ(i)+cz)+.012);
  var U={uTex:{value:tex},uL:grooveU.uL,uT:{value:1/SAND_PX},uK:{value:2.6}};
  var vs='varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
  var fs='uniform sampler2D uTex;uniform vec3 uL;uniform float uT,uK;varying vec2 vUv;varying vec3 vW;'+
    'float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'+
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1.,0.)),f.x),mix(gh(i+vec2(0.,1.)),gh(i+vec2(1.,1.)),f.x),f.y);}'+
    'float H(vec2 u){return texture2D(uTex,u).r;}'+
    'float shade(){vec2 jit=(vec2(vn(vW.xz*12.),vn(vW.xz*12.+5.3))-.5)*uT*2.2;vec2 u=vUv+jit;float hc=H(u);'+
    'float t=uT*1.;float hx=H(u+vec2(t,0.))-H(u-vec2(t,0.)),hz=H(u-vec2(0.,t))-H(u+vec2(0.,t));'+
    'vec3 n=normalize(vec3(hx*uK,1.,hz*uK));float lit=(dot(n,uL)-uL.y)/(.35+uL.y*.65);'+
    'float occ=-hc*.3;float grain=(gh(floor(vW.xz*90.))-.5)*smoothstep(.02,.25,hc)*.35;'+
    'float crumb=step(.93,gh(floor(vW.xz*60.)+7.))*smoothstep(.05,.2,hc)*(1.-smoothstep(.35,.6,hc))*-.35;'+
    'return lit*1.2+occ+grain+crumb;}'+
    'float mud(){return smoothstep(.2,.75,H(vUv));}';
  var mD=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,blending:THREE.MultiplyBlending,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
    vertexShader:vs,fragmentShader:fs+'void main(){float s=shade();vec3 tint=mix(vec3(1.),vec3(.6,.47,.34)*(.92+.16*gh(floor(vW.xz*70.))),mud()*.9);gl_FragColor=vec4(tint*(1.-clamp(-s,0.,.55)),1.);}'});
  var mL=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.DstColorFactor,blendDst:THREE.OneFactor,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,
    vertexShader:vs,fragmentShader:fs+'void main(){float s=shade()*(1.-mud()*.7);gl_FragColor=vec4(vec3(clamp(s*.7,0.,.22)),1.);}'});
  var g=new THREE.Group();g.position.set(cx,0,cz);var a=new THREE.Mesh(geo,mD),b=new THREE.Mesh(geo,mL);a.renderOrder=2;b.renderOrder=3;a.userData.noShadow=b.userData.noShadow=true;a.frustumCulled=b.frustumCulled=false;g.add(a);g.add(b);world.add(g);
  // 파도가 닿는지 살필 칸: 칸마다 땅 높이와 물가 구간을 미리 구해 둔다
  var cells=[],cs=SAND_SZ/SAND_CELLS;for(var j=0;j<SAND_CELLS;j++)for(var k=0;k<SAND_CELLS;k++){var wx=cx-SAND_SZ/2+(k+.5)*cs,wz=cz-SAND_SZ/2+(j+.5)*cs;cells.push({h:W.height(wx,wz),bin:binOf(wx,wz),px:k*SAND_PX/SAND_CELLS,py:j*SAND_PX/SAND_CELLS})}
  return {cx:cx,cz:cz,cv:cv,ctx:cx2,tex:tex,g:g,cells:cells,used:false,tw:0,td:0};
}
function getSandArea(c){var L=W.sandAreas;for(var i=0;i<L.length;i++)if(Math.hypot(L[i].cx-c.x,L[i].cz-c.z)<1.5)return L[i];
  if(L.length>=3){var o=L.shift();world.remove(o.g);o.tex.dispose()}var A=makeSandArea(c.x,c.z);L.push(A);return A}
function areaDraw(A,P0,P1){var k=SAND_PX/SAND_SZ,x0=(P0.x-A.cx+SAND_SZ/2)*k,y0=(P0.z-A.cz+SAND_SZ/2)*k,x1=(P1.x-A.cx+SAND_SZ/2)*k,y1=(P1.z-A.cz+SAND_SZ/2)*k,c=A.ctx;
  c.globalCompositeOperation='lighten';c.lineCap='round';c.lineJoin='round';
  [[9,'#3a3a3a'],[7,'#7a7a7a'],[5,'#b8b8b8'],[3.2,'#e6e6e6'],[1.6,'#ffffff']].forEach(function(q){c.lineWidth=q[0]*(.9+Math.random()*.2);c.strokeStyle=q[1];c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke()});
  c.globalCompositeOperation='source-over';A.used=true;A.tex.needsUpdate=true}
function updSandAreas(dt){grooveU.uL.value.copy(sun.position).sub(sun.target.position).normalize();
  W.sandAreas.forEach(function(A){if(!A.used)return;var c=A.ctx,ch=false,cw=SAND_PX/SAND_CELLS+1;A.tw+=dt;A.td+=dt;
    if(A.tw>.25){A.tw=0;c.fillStyle='rgba(0,0,0,.07)';for(var i=0;i<A.cells.length;i++){var q=A.cells[i];if(W.swash[q.bin]>q.h+.01){c.fillRect(q.px,q.py,cw,cw);ch=true}}}
    if(A.td>2){A.td=0;c.fillStyle='rgba(0,0,0,.018)';c.fillRect(0,0,SAND_PX,SAND_PX);ch=true}
    if(ch)A.tex.needsUpdate=true})}
function onSand(x,z){var h=W.height(x,z);return h>-.25&&h<1.0}
function syncWriteUI(){var on=WR.mode==='draw';$('writebar').hidden=!on;$('sandw').disabled=!!WR.mode||state.sit!=='none';$('sandw').textContent=WR.mode==='engrave'?'새기는 중':'모래글'}
$('sandw').onclick=function(){
  if(saverOn||modalOpen||WR.mode||state.sit!=='none')return;var w=W.who;
  var f=new V3(Math.sin(w.rotation.y),0,Math.cos(w.rotation.y)),c=w.position.clone().addScaledVector(f,3.2);
  if(!onSand(c.x,c.z)||!onSand(w.position.x,w.position.z)){toast('백사장에 서서 모래 쪽을 바라보면 쓸 수 있습니다.',4);return}
  WR.mode='draw';WR.strokes=[];WR.cur=null;WR.face.copy(f);WR.center.set(c.x,W.height(c.x,c.z),c.z);state.target=null;W.marker.visible=false;for(var k in keys)keys[k]=false;
  wrRing.position.set(c.x,WR.center.y+.05,c.z);wrRing.visible=true;wrLine.visible=true;wrRebuild();syncWriteUI();
};
$('wclear').onclick=function(){WR.strokes=[];wrRebuild()};
$('wcancel').onclick=function(){WR.mode=null;WR.strokes=[];wrRebuild();wrLine.visible=false;wrRing.visible=false;syncWriteUI()};
$('wgo').onclick=function(){
  WR.strokes=WR.strokes.filter(function(s){return s.length>1});
  if(!WR.strokes.length){toast('먼저 모래 위에 획을 그어 주세요.',3);return}
  WR.area=getSandArea(WR.center);WR.mode='engrave';WR.si=0;WR.pi=0;WR.phase='goto';WR.tip=null;wrRing.visible=false;state.pitch=Math.max(state.pitch,.7);state.dist=Math.min(state.dist,11);syncWriteUI();
};
function wrHit(e){var r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(ndc,camera);
  var h=ray.intersectObject(W.terrain,false)[0];if(!h)return null;var p=h.point;
  if(Math.hypot(p.x-WR.center.x,p.z-WR.center.z)>5.3||!onSand(p.x,p.z))return null;return new V3(p.x,p.y,p.z)}
function wrDown(e){var p=wrHit(e);if(!p){WR.cur=null;return}WR.cur=[p];WR.strokes.push(WR.cur);wrRebuild()}
function wrMove(e){if(!WR.cur)return;var p=wrHit(e);if(!p){WR.cur=null;return}var L=WR.cur[WR.cur.length-1];if(p.distanceTo(L)<.07)return;if(WR.len>=WR_MAXPTS-2){toast('더 쓸 자리가 없습니다.',2);WR.cur=null;return}WR.cur.push(p);wrRebuild()}
function wrUp(){WR.cur=null}
var stickTipV=new V3();
// 새기기: 획의 첫 점 옆으로 걸어가 막대를 대고, 획을 따라 천천히 긁는다. 막대 끝이 지나간 자리에 홈이 생긴다
function updWrite(dt,t,who,P){
  var stick=W.stick,inE=WR.mode==='engrave';stick.visible=inE&&WR.phase==='carve';
  if(!inE)return;
  var anyKey=false;for(var k in keys)if(keys[k])anyKey=true;
  if(anyKey||(state.target&&state.target!==WR.tgt)){WR.mode=null;WR.strokes=[];wrRebuild();wrLine.visible=false;syncWriteUI();return}
  var st=WR.strokes[WR.si],face=WR.face;
  if(WR.phase==='goto'){var s0=st[0];
    if(!WR.tgt){WR.tgt={x:s0.x-face.x*1.0,z:s0.z-face.z*1.0};state.target=WR.tgt}
    if(!state.target){WR.tgt=null;WR.phase='carve';WR.tip=s0.clone();WR.pi=1;WR.legT=0}
    return}
  // 막대를 쥔 자세: 몸을 숙이고 오른팔을 앞으로 내린다
  var lean=.38;P.up.rotation.set(lean,0,0);P.up.position.set(0,1.62-1.62*Math.cos(lean),-1.62*Math.sin(lean));
  P.armR.rotation.set(-.85,0,-.2);P.elbR.rotation.x=-.35;P.armL.rotation.set(-.2,0,.25);P.elbL.rotation.x=-.5;P.head.rotation.x=.35;
  who.rotation.y+=wrapA(Math.atan2(face.x,face.z)-who.rotation.y)*Math.min(1,dt*6);
  // 막대 끝을 획 위로 옮긴다
  var spd=1.5,move=spd*dt,moved=0;
  while(move>0&&WR.pi<st.length){var nx=st[WR.pi],d=WR.tip.distanceTo(nx);
    if(d<=move){areaDraw(WR.area,WR.tip,nx);WR.tip.copy(nx);WR.pi++;move-=d;moved+=d}
    else{var b=WR.tip.clone().lerp(nx,move/d);areaDraw(WR.area,WR.tip,b);WR.tip.copy(b);moved+=move;move=0}}
  who.updateMatrixWorld(true);W.stickTip.getWorldPosition(stickTipV);
  who.position.x+=(WR.tip.x-stickTipV.x);who.position.z+=(WR.tip.z-stickTipV.z);who.position.y=W.height(who.position.x,who.position.z);
  WR.legT+=moved*7;var sw=Math.sin(WR.legT)*.35*(moved>0?1:0);P.legL.rotation.x=sw;P.legR.rotation.x=-sw;
  if(WR.pi>=st.length){WR.si++;if(WR.si>=WR.strokes.length){WR.mode=null;WR.strokes=[];wrRebuild();wrLine.visible=false;syncWriteUI();P.up.rotation.set(0,0,0);P.up.position.set(0,0,0);P.head.rotation.x=0;P.armR.rotation.z=-.13;P.armL.rotation.z=.13;toast('모래에 글을 새겼습니다. 파도가 닿으면 지워집니다.',4)}else{WR.phase='goto';WR.tgt=null}}
  else{wrRebuild()}
}

/* ---------- 설정: 소리·날씨·화면보호기 ---------- */
// 날씨 자동 변경: 켜면 5~10분마다 무작위로(맑음이 가장 잦고 폭풍우가 가장 드물다) 바뀌고, 끄면 그때 날씨에 고정한다. 브라우저에 기억해 둔다
// 비 안 오는 날(맑음·흐림)과 비 오는 날이 8:2쯤(env.js의 pick과 같은 비율). 지금 날씨도 다시 뽑힐 수 있다.
// 지금 날씨를 빼고 뽑으면 맑음이 맑음으로 이어지지 못해, 맑은 뒤에는 늘 다른 날씨(절반 넘게 비)로 넘어가 비가 비율보다 훨씬 잦아진다
var WX_W={clear:.62,cloudy:.18,drizzle:.09,rain:.05,shower:.04,storm:.02};
function randomWx(cur){var tot=0,k;for(k in WX_W)tot+=WX_W[k];var r=Math.random()*tot;for(k in WX_W){r-=WX_W[k];if(r<=0)return k}return 'clear'}
function setWxAuto(on){WX.auto=on;WX.until=0;try{localStorage.setItem('bottle-island-wxauto',on?'1':'0');if(!on)localStorage.setItem('bottle-island-wxkind',WX.kind)}catch(e){}syncSet()}
var VOL_NAMES=['저','중','고'];
function syncVol(id,lv,on){var el=$(id);if(!el)return;el.value=String(lv);el.setAttribute('aria-valuetext',VOL_NAMES[lv]);el.closest('.vol').classList.toggle('off',!on)}
function syncSet(){var b=$('setbg');if(b)b.checked=soundOn;var r=$('setradio');if(r)r.checked=radio.on;var w=$('setwx');if(w)w.checked=WX.auto;syncVol('setbgv',bgLv,soundOn);syncVol('setrv',rLv,radio.on);
  var rs=$('setrsp');if(rs)rs.checked=radio.spatial;var rn=$('setrspnote');if(rn)rn.textContent=radio.spatial?'라디오 쪽에서 들리고, 멀어지면 작아집니다.':'섬 어디서든 같은 크기로 들립니다.';
  var n=$('setwxnote');if(n)n.textContent=WX.auto?'5~10분마다 무작위로 바뀝니다. 지금은 '+WX_KIND[WX.kind].name+'.':'지금 날씨('+WX_KIND[WX.kind].name+')에 고정합니다.'}
function openSet(on){var pn=$('setpanel'),g=$('gear');if(!pn)return;pn.hidden=!on;g.setAttribute('aria-expanded',String(on));if(on)syncSet()}
function closeSet(){openSet(false)}
$('gear').onclick=function(ev){ev.stopPropagation();openSet($('setpanel').hidden)};
document.addEventListener('pointerdown',function(ev){var pn=$('setpanel');if(pn&&!pn.hidden&&!pn.contains(ev.target)&&ev.target!==$('gear'))closeSet()},true);
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&!$('setpanel').hidden)closeSet()});
$('setbg').onchange=function(){initAudio();setSound(this.checked)};
$('setradio').onchange=function(){initAudio();if(this.checked){if(!radio.on)radioPlay()}else{radioStop();radioStatus('')}};
$('setwx').onchange=function(){setWxAuto(this.checked)};
$('setrsp').onchange=function(){setRadioSpatial(this.checked)};
$('setbgv').oninput=function(){setBgVol(+this.value)};
$('setrv').oninput=function(){setRadioVol(+this.value)};
$('setsaver').onclick=function(){closeSet();enterSaver(true)};
// 모바일: 계정 버튼이 설정 안에 있다. 누르면 설정을 닫고 계정 창을 연다(창은 AccountPanel이 연다)
$('setacct').addEventListener('click',closeSet);
/* ---------- 앉기와 모닥불 돌보기 ---------- */
function smoother(k){return k*k*k*(k*(k*6-15)+10)}
function syncSit(){var s=state.sit,b=$('sit');b.disabled=s==='up'||s==='unlie';if(WR)$('sandw').disabled=!!WR.mode||s!=='none';
  b.textContent=s==='none'?'앉기':s==='seat'?'앉으러 가는 중':'일어서기'}
function beginSit(fire){var S=state,w=W.who;S.sitT=0;S.lieAfter=300;S.lieK=0;sfx('sit',w.position.x,w.position.y+.6,w.position.z,.55);S.sit='down';S.sitFire=fire;S.sitFace=null;S.sitBase={x:w.position.x,z:w.position.z};S.woodT=4+Math.random()*5;S.woodA=-1;S.target=null;W.marker.visible=false;syncSit()}
$('sit').onclick=function(){
  if(saverOn||modalOpen)return;var S=state,w=W.who;
  if(S.sit==='seat'){S.sit='none';S.target=null;W.marker.visible=false}
  else if(S.sit==='none'){
    // 천막 안(깔개 둘레)이면 그 자리에서 입구(모닥불·바다 쪽)를 보고 앉는다. 모닥불 자리로는 불가에 서 있을 때(3.2m 안)만 간다
    var lp=W.shelter.worldToLocal(w.position.clone());
    if(Math.abs(lp.x)<1.7&&Math.abs(lp.z)<2.2){var fq=W.shelter.localToWorld(new V3(lp.x,0,lp.z+1));beginSit(false);S.sitFace=Math.atan2(fq.x-w.position.x,fq.z-w.position.z)}
    else if(Math.hypot(w.position.x-W.fire.pos.x,w.position.z-W.fire.pos.z)<3.2){var st=W.seats[lp.z>3.3?0:1];S.seatSel=st;S.sit='seat';S.target={x:st.x,z:st.z};S.seatTarget=S.target;W.marker.visible=false}
    else if(W.height(w.position.x,w.position.z)<W.swash[binOf(w.position.x,w.position.z)]+.08){toast('물이 닿는 자리에는 앉을 수 없습니다.',3);return}
    else beginSit(false)}
  else if(S.sit==='down'||S.sit==='sitting')S.sit='up';
  else if(S.sit==='lie')S.sit='unlie';
  syncSit();
};
function autoSit(){var S=state,w=W.who;if(W.height(w.position.x,w.position.z)<W.swash[binOf(w.position.x,w.position.z)]+.08)return;
  var lp=W.shelter.worldToLocal(w.position.clone());
  if(Math.abs(lp.x)<1.7&&Math.abs(lp.z)<2.2){var fq=W.shelter.localToWorld(new V3(lp.x,0,lp.z+1));beginSit(false);S.sitFace=Math.atan2(fq.x-w.position.x,fq.z-w.position.z)}else beginSit(false)}
// 장작 넣기: 오른쪽 장작더미에서 집어 가슴 앞으로 가져온 뒤, 팔을 아래로 살짝 뒤로 뺐다가 앞쪽 위로 부드럽게 쳐 올리며 놓는다(밑던지기).
// 앉은 자리에서 불까지는 2m 남짓이라 팔을 뻗어도 닿지 않는다. 잠깐 그대로 있다가 돌아온다
// [시각, 몸 비틀기, 숙이기, 어깨 앞뒤, 어깨 옆, 팔꿈치]
var WOOD_K=[[0,0,0,-.85,-.13,-.25],[.6,-.55,.3,-.3,-.6,-.12],[.95,-.6,.34,-.25,-.62,-.15],[1.5,-.1,.2,-.7,-.25,-.6],[1.9,0,.48,-.4,-.18,-.25],[2.25,0,.58,-1.4,-.15,-.08],[2.65,0,.45,-1.15,-.15,-.2],[3.3,0,0,-.85,-.13,-.25]];
function woodPose(a){for(var i=1;i<WOOD_K.length;i++)if(a<=WOOD_K[i][0]){var A=WOOD_K[i-1],B=WOOD_K[i],u=smoother((a-A[0])/(B[0]-A[0])),o=[];for(var j=1;j<6;j++)o.push(lerp(A[j],B[j],u));return o}
  return WOOD_K[WOOD_K.length-1].slice(1)}
var tmpV=new V3(), glowW=new V3(), glowD=new V3();
function updSit(dt,t,who,P){
  var S=state,prev=S.sit;
  if(S.sit==='down'){S.sitK=Math.min(1,S.sitK+dt/1.3);if(S.sitK>=1)S.sit='sitting'}
  // 앉은 지 5분이 지나면 가방을 베고 눕는다. 일어설 때는 먼저 일어나 앉았다가 선다
  else if(S.sit==='sitting'&&!(S.sitFire&&S.woodA>=0)){S.sitT=(S.sitT||0)+dt;if(S.sitT>(S.lieAfter||300)){S.sit='lie';S.lieArm=Math.random()<.5?1:0;S.lieLeg=Math.random()<.5?1:0;S.eyeShut=false;S.eyeT=4+Math.random()*4}}
  else if(S.sit==='lie'){S.lieK=Math.min(1,(S.lieK||0)+dt/2.4)}
  else if(S.sit==='unlie'){S.lieK=Math.max(0,(S.lieK||0)-dt/1.8);if(S.lieK<=0)S.sit='up'}
  else if(S.sit==='up'){S.sitK=Math.max(0,S.sitK-dt/1.05);if(S.sitK<=0){S.sit='none';S.woodA=-1;W.handLog.visible=false}}
  if(S.sit!==prev)syncSit();
  if(S.sit==='none'||S.sit==='seat'){if(S.sitBase&&S.sit==='none'&&prev==='up'){who.position.x=S.sitBase.x;who.position.z=S.sitBase.z;who.position.y=W.height(who.position.x,who.position.z)}P.up.rotation.x=0;P.up.rotation.y=0;
    if(P.bagRest){P.bag.position.copy(P.bagRest.p);P.bag.rotation.set(0,0,P.bagRest.rz);P.strap.visible=true}return}
  // 불 쪽으로 몸을 돌린다
  if(!S.sitFire&&S.sitFace!=null&&S.sit==='down')who.rotation.y+=wrapA(S.sitFace-who.rotation.y)*Math.min(1,dt*5);
  if(S.sitFire&&S.sit==='down'){var want=S.seatSel?S.seatSel.yaw:Math.atan2(W.fire.pos.x-S.sitBase.x,W.fire.pos.z-S.sitBase.z);who.rotation.y+=wrapA(want-who.rotation.y)*Math.min(1,dt*5)}
  var e=smoother(S.sitK),b=Math.sin(Math.PI*e),yaw=who.rotation.y;
  // 엉덩이를 뒤로 빼며 무릎을 깊게 굽히고, 중간에 손을 뒤로 내려 땅을 짚었다가, 다리를 앞으로 내밀며 자리 잡는다
  who.position.x=S.sitBase.x-Math.sin(yaw)*.42*e; who.position.z=S.sitBase.z-Math.cos(yaw)*.42*e;
  who.position.y=W.height(who.position.x,who.position.z)-1.12*e;
  var th=-2.0*e-.2*b,kn=1.1*e+1.3*b,breathe=Math.sin(t*1.6)*.012*S.sitK;
  P.legL.rotation.set(th+.04,0,.13*e);P.legR.rotation.set(th-.04,0,-.13*e);P.kneeL.rotation.x=kn;P.kneeR.rotation.x=kn+.07;
  var lean=.12*e+.55*b,twist=0,shX=-.85*e+.75*b,shZ=-.13,elX=-.25*e-.1*b,hy=Math.sin(t*.4)*.35*S.sitK;
  // 모닥불 곁에서는 가끔 장작을 넣는다
  if(S.sit==='sitting'&&S.sitFire&&state.fire>.5){
    if(S.woodA<0){S.woodT-=dt;if(S.woodT<=0){S.woodA=0;S.woodT=12+Math.random()*14;S.released=false}}
    else{S.woodA+=dt;var o=woodPose(S.woodA);twist=o[0];lean+=o[1];shX=o[2];shZ=o[3];elX=o[4];hy=S.woodA<.95?-.45:0;
      W.handLog.visible=S.woodA>.85&&S.woodA<2.1;
      if(S.woodA>=2.1&&!S.released){S.released=true;W.handLog.getWorldPosition(tmpV);var FL=W.flyLog,q0=new THREE.Quaternion();W.handLog.getWorldQuaternion(q0);
        var ra=Math.random()*6.283,rr=Math.random()*.12;FL.visible=true;FL.scale.setScalar(1);
        FL.userData={t:0,ph:'fly',sp:Math.atan2(W.fire.pos.x-tmpV.x,W.fire.pos.z-tmpV.z),from:tmpV.clone(),to:new V3(W.fire.pos.x+Math.cos(ra)*rr,W.fire.pos.y+.14,W.fire.pos.z+Math.sin(ra)*rr),q0:q0,q1:new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random()-.5)*.25,Math.random()*6.283,0))}}
      if(S.woodA>3.3)S.woodA=-1}}
  else if(S.sitFire){hy=Math.sin(t*.25)*.2*S.sitK}
  // 눕기: 엉덩이를 축으로 상체를 뒤로 눕히고(가방 베개만큼 머리 쪽이 조금 들림), 다리를 펴거나 한쪽 무릎을 세운다.
  // 팔은 두 팔을 몸 옆에 가지런히 내리거나, 오른팔을 안쪽으로 돌려 굽혀 손을 배 위에 올린다(팔꿈치는 한 방향으로만 굽으므로 먼저 팔을 돌린다).
  // 가슴이 천천히 오르내린다
  var lk=smoother(clamp(S.lieK||0,0,1)),aL0=[-.85*e+.75*b,0,.13+.05*e],eL0=-.25*e-.1*b,hx0=(S.sitFire?.12:0)*S.sitK;
  var shY=0;
  if(lk>0){lean=lerp(lean,-1.38,lk);twist*=1-lk;breathe+=Math.sin(t*1.05)*.018*lk;shX=lerp(shX,S.lieArm?-.15:-.12,lk);shY=(S.lieArm?1.05:0)*lk;shZ=lerp(shZ,S.lieArm?-.1:-.22,lk);elX=lerp(elX,S.lieArm?-1.75:-.15,lk);hy=lerp(hy,Math.sin(t*.13)*.18,lk);
    aL0=[lerp(aL0[0],-.12,lk),0,lerp(aL0[2],.22,lk)];eL0=lerp(eL0,-.15,lk);hx0=lerp(hx0,.32,lk);
    // 세운 무릎: 허벅지를 수평보다 35° 남짓 들고(-2.2) 무릎을 접어(1.69) 발이 엉덩이 앞 모래에 닿게 한다. 조금 바깥으로 벌린다
    var lth=lerp(th,-1.55,lk),lkn=lerp(kn,.08,lk),rth=lerp(th,S.lieLeg?-2.2:-1.55,lk),rkn=lerp(kn,S.lieLeg?1.69:.12,lk);
    P.legL.rotation.set(lth+.04,0,.13*e*(1-lk)+.06*lk);P.legR.rotation.set(rth-.04,0,-.13*e*(1-lk)-(S.lieLeg?.14:.06)*lk);P.kneeL.rotation.x=lkn;P.kneeR.rotation.x=rkn;
    who.position.y+=.045*lk}
  P.up.rotation.set(lean,twist,0);P.up.position.set(0,1.62-1.62*Math.cos(lean)+breathe,-1.62*Math.sin(lean));
  P.armL.rotation.set(aL0[0],aL0[1],aL0[2]);P.elbL.rotation.x=eL0;
  P.armR.rotation.set(shX,shY,shZ);P.elbR.rotation.x=elX;
  P.head.rotation.y+=(hy-P.head.rotation.y)*Math.min(1,dt*4);P.head.rotation.x=hx0;
  // 가방: 벗어서 살짝 들어 머리 밑에 베개로 놓는다(어깨끈은 벗는 동안 사라진다)
  if(!P.bagRest)P.bagRest={p:P.bag.position.clone(),rz:P.bag.rotation.z};
  var bs=smoothstep(.12,.75,S.lieK||0);P.bag.position.set(lerp(P.bagRest.p.x,0,bs),lerp(P.bagRest.p.y,2.98,bs)+Math.sin(Math.PI*bs)*.28,lerp(P.bagRest.p.z,-.47,bs));
  P.bag.rotation.set(0,0,lerp(P.bagRest.rz,0,bs));P.strap.visible=bs<.3;
  // 눈: 누워 있으면 한동안 감았다가 가끔 뜬다(뜨고 있을 때는 평소처럼 깜빡인다)
  if((S.lieK||0)>.9){S.eyeT-=dt;if(S.eyeT<=0){S.eyeShut=!S.eyeShut;S.eyeT=S.eyeShut?15+Math.random()*30:6+Math.random()*9}}else S.eyeShut=false;
  S.eyeK=(S.eyeK||0)+((S.eyeShut?1:0)-(S.eyeK||0))*Math.min(1,dt*(S.eyeShut?1.2:6));
  if(S.eyeK>.01){P.eyes[0].scale.y*=1-.9*S.eyeK;P.eyes[1].scale.y*=1-.9*S.eyeK}
}
// 놓은 장작: 손을 떠나 30cm 남짓 떠올랐다가 중력처럼 떨어지는 포물선을 그리며 반 바퀴쯤 천천히 뒤집혀, 불 위에 가로눕고 살짝 내려앉는다.
// 불 위에 얹히면 불길이 잠깐 커지고, 겉이 검게 그을리며 틈마다 잉걸불이 피어나다가, 무늬를 따라 조금씩 부서져(불테를 남기며) 11초 만에 사라진다
function updFlyLog(dt){var FL=W.flyLog;if(!FL.visible)return;var d=FL.userData,M=FL.material,EU=M.userData.ember;d.t+=dt;
  if(d.ph==='fly'){var u=Math.min(1,d.t/.55),su=u*u*(3-2*u),ty=d.to.y+.04,ap=Math.max(d.from.y,ty)+.32,yc=2*ap-.5*(d.from.y+ty);
    FL.position.lerpVectors(d.from,d.to,u);FL.position.y=(1-u)*(1-u)*d.from.y+2*u*(1-u)*yc+u*u*ty;
    // 날아가는 방향에 수직인 수평축으로 반 바퀴 뒤집힌다(통나무라 반 바퀴 돌아도 가로누운 채로 끝난다)
    FL.quaternion.copy(d.q0).slerp(d.q1,su);tmpQ.setFromAxisAngle(tmpAx.set(Math.cos(d.sp),0,-Math.sin(d.sp)),Math.PI*su);FL.quaternion.premultiply(tmpQ);
    M.color.copy(M.userData.base);M.emissiveIntensity=0;EU.uBurn.value=0;
    if(u>=1){d.ph='burn';d.t=0;state.boost=1;sfx('log',d.to.x,d.to.y,d.to.z,.6)}}
  else{var k=Math.min(1,d.t/11);
    M.color.copy(M.userData.base).lerp(tmpC.setRGB(.06,.045,.035),smoothstep(0,.45,k));
    M.emissiveIntensity=3.2*smoothstep(.04,.3,k)*(1-.5*smoothstep(.8,1,k));EU.uBurn.value=smoothstep(.35,1,k);
    FL.position.set(d.to.x,d.to.y+.04*(1-smoothstep(0,.03,k))-.06*smoothstep(.3,1,k),d.to.z);
    if(k>=1){FL.visible=false;M.emissiveIntensity=0;EU.uBurn.value=0}}}
var tmpC=new THREE.Color(),tmpQ=new THREE.Quaternion(),tmpAx=new V3();


var nearThing=null;
// 행동 버튼: 라디오 곁에서는 '라디오를 켠다'(켜져 있으면 '라디오를 끈다'), 회원이 병을 가지고 해변에 있으면 '편지를 쓴다'(병은 눌러서 줍는다)
$('action').onclick=function(){ if(!nearThing)return; if(nearThing.type==='radio'){if(radio.on){radioStop();radioStatus('')}else listenRadio()} else writeLetter(); };

/* ---------- 화면보호기: 섬을 전체화면으로 띄워 두고, 아래의 끄기 버튼으로 끈다 ---------- */
// 시점은 캐릭터 뒤 조금 위에서 바다 쪽(섬 가운데에서 캐릭터 쪽으로 나가는 방향)을 바라보며 시작한다. 그동안 화면을 끌거나 벌려
// 시점만 바꿀 수 있고, 눌러도 캐릭터는 걷지 않는다. 캐릭터는 바다를 보고 서고, 가만히 두면 저절로 앉았다가 눕는다. 끝나면 원래 시점으로 돌아간다
var saverOn=false, wakeLock=null, saverCam=null;
try{localStorage.removeItem('bottle-island-pin');localStorage.removeItem('bottle-island-lock')}catch(e){}
function enterSaver(full){
  saverOn=true;state.target=null;W.marker.visible=false;for(var k in keys)keys[k]=false;closeSet();
  var w=W.who,sx=w.position.x,sz=w.position.z,sl=Math.hypot(sx,sz);if(sl<2){sx=Math.sin(w.rotation.y);sz=Math.cos(w.rotation.y);sl=1}sx/=sl;sz/=sl;
  saverCam={yaw:state.yaw,pitch:state.pitch,dist:state.dist};state.yaw=Math.atan2(-sx,-sz);state.pitch=.2;state.dist=10;
  if(state.sit==='none')w.rotation.y=Math.atan2(sx,sz);
  $('hud').hidden=true;$('lock').hidden=false;
  var app=$('app');
  if(full&&app.requestFullscreen){try{var p=app.requestFullscreen();if(p&&p.catch)p.catch(function(){})}catch(e){}}
  if(navigator.wakeLock&&navigator.wakeLock.request){try{navigator.wakeLock.request('screen').then(function(wl){wakeLock=wl},function(){})}catch(e){}}
}
function leaveSaver(){
  if(!saverOn)return;saverOn=false;$('lock').hidden=true;$('hud').hidden=false;
  if(saverCam){state.yaw=saverCam.yaw;state.pitch=saverCam.pitch;state.dist=saverCam.dist;saverCam=null}
  if(document.fullscreenElement&&document.exitFullscreen){try{var p=document.exitFullscreen();if(p&&p.catch)p.catch(function(){})}catch(e){}}
  if(wakeLock){try{wakeLock.release()}catch(e){}wakeLock=null}
  canvas.focus();
}
$('saveroff').onclick=leaveSaver;
// 화면보호기 시계: 왼쪽 위에 오늘 날짜(2026-11-14 SAT)와 시간. 디지털(시:분 크게, 초는 작게)과 아날로그(초침이 부드럽게 돈다) 중 고르고 브라우저에 기억한다
var SDAYS=['SUN','MON','TUE','WED','THU','FRI','SAT'],saverClock=(function(){try{return localStorage.getItem('bottle-saver-clock')==='analog'?'analog':'digital'}catch(e){return 'digital'}})();
function setSaverClock(m){saverClock=m;try{localStorage.setItem('bottle-saver-clock',m)}catch(e){}
  $('sdigital').hidden=m!=='digital';$('sanalog').hidden=m!=='analog';
  var tg=$('sclk');tg.querySelectorAll('span').forEach(function(sp){sp.classList.toggle('on',sp.getAttribute('data-m')===m)});
  tg.setAttribute('aria-label',(m==='digital'?'디지털':'아날로그')+' 시계 · 누르면 '+(m==='digital'?'아날로그':'디지털')+'로 바꿉니다');updSaverClock()}
function updSaverClock(){var d=new Date(),h=d.getHours(),mi=d.getMinutes(),se=d.getSeconds(),ms=d.getMilliseconds(),p2=function(n){return(n<10?'0':'')+n};
  var ds=d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+' '+SDAYS[d.getDay()],de=$('sdate');if(de.textContent!==ds)de.textContent=ds;
  if(saverClock==='digital'){var hm=p2(h)+':'+p2(mi);if($('shm').textContent!==hm)$('shm').textContent=hm;$('ssec').textContent=p2(se)}
  else{var sf=se+ms/1000;$('ssh').setAttribute('transform','rotate('+(sf*6)+' 100 100)');$('smh').setAttribute('transform','rotate('+((mi+sf/60)*6)+' 100 100)');$('shh').setAttribute('transform','rotate('+(((h%12)+mi/60)*30)+' 100 100)')}}
$('sclk').onclick=function(){setSaverClock(saverClock==='digital'?'analog':'digital')};
setSaverClock(saverClock);

/* ---------- 조작 ---------- */
var keys={}, ptrs={}, drag=null, pinch=0;
window.addEventListener('keydown',function(e){if(modalOpen||saverOn||WR.mode==='draw')return;
  // 키보드: 병 곁(1.8m 안)에서 Enter를 누르면 줍는다. 버튼·입력칸에 있을 때는 그쪽 Enter로 둔다
  if(e.key==='Enter'&&!(e.target&&e.target.closest&&e.target.closest('button,input,textarea,select,a'))){var w=W.who,nb=null,nd=1.8;
    state.beach.forEach(function(b){if(b.arrive<1)return;var d=Math.hypot(b.mesh.position.x-w.position.x,b.mesh.position.z-w.position.z);if(d<nd){nd=d;nb=b}});if(nb){goPick(nb);e.preventDefault();return}}
  keys[e.key.toLowerCase()]=true;if(e.key.indexOf('Arrow')===0)e.preventDefault()});
window.addEventListener('keyup',function(e){keys[e.key.toLowerCase()]=false});
canvas.addEventListener('pointerdown',function(e){canvas.setPointerCapture(e.pointerId);if(WR.mode==='draw'){wrDown(e);return}ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
  var n=Object.keys(ptrs).length; if(n===1)drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false}; else{drag=null;pinch=pdist()}});
canvas.addEventListener('pointermove',function(e){if(WR.mode==='draw'){wrMove(e);return}if(!ptrs[e.pointerId])return;ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
  if(Object.keys(ptrs).length>=2){var d=pdist();if(pinch>0)state.dist=clamp(state.dist*pinch/d,10,60);pinch=d;return}
  if(!drag)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>7)drag.moved=true;
  if(drag.moved){state.yaw-=dx*0.006;state.pitch=clamp(state.pitch+dy*0.004,-0.6,1.25)}
  drag.x=e.clientX;drag.y=e.clientY});
function pup(e){if(WR.mode==='draw'){wrUp();return}var was=drag;delete ptrs[e.pointerId];if(Object.keys(ptrs).length<2)pinch=0;
  if(was&&!was.moved&&e.type==='pointerup')tap(e.clientX,e.clientY);drag=null}
canvas.addEventListener('pointerup',pup);canvas.addEventListener('pointercancel',pup);
canvas.addEventListener('wheel',function(e){e.preventDefault();state.dist=clamp(state.dist*(1+Math.sign(e.deltaY)*0.1),10,60)},{passive:false});
function pdist(){var k=Object.keys(ptrs);var a=ptrs[k[0]],b=ptrs[k[1]];return Math.hypot(a.x-b.x,a.y-b.y)||1}
var ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
function tap(cx,cy){if(saverOn)return;var r=canvas.getBoundingClientRect();
  var pb=bottleAt(cx,cy,r);if(pb){goPick(pb);return}
  state.pickB=null;ndc.set((cx-r.left)/r.width*2-1,-((cy-r.top)/r.height*2-1));ray.setFromCamera(ndc,camera);
  var hit=ray.intersectObject(W.terrain,false)[0];if(!hit)return;state.target={x:hit.point.x,z:hit.point.z};
  W.marker.position.set(hit.point.x,Math.max(hit.point.y,W.sea)+.12,hit.point.z);W.marker.visible=true}

function sunE(){return Math.sin((state.t/DAY%1)*Math.PI*2)+0.3}

/* ---------- 매 프레임 ---------- */
function resize(){var w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();cloudSys.U.uPx.value=h*renderer.getPixelRatio()/(2*Math.tan(camera.fov*Math.PI/360));PXU.value=cloudSys.U.uPx.value}
if(window.ResizeObserver)new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize);
var gradeT=0, last=performance.now(), statusT=0, calm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?0.35:1;
function frame(now){
  requestAnimationFrame(frame);
  var dt=Math.min(0.05,(now-last)/1000); last=now; state.t=T0+(now-P0)/1000;
  var t=state.t, day=Math.floor(t/DAY)+1, e=sunE(), cloudy=false, who=W.who, P=W.P;

  // 하늘과 빛
  var light=clamp((e+0.25)/0.5,0,1), dusk=clamp(1-Math.abs(e)/0.35,0,1);
  // 날씨: 정해진 시간이 지나면 다음 날씨로 넘어가고, 구름·어둠·비·바람이 천천히 따라 바뀐다
  if(WX.auto&&!(WX.until>t)){if(WX.until)WX.kind=randomWx(WX.kind);WX.until=t+300+Math.random()*300;if(!$('setpanel').hidden)syncSet()}
  var WK=WX_KIND[WX.kind],wr=Math.min(1,dt*(t<WX.fastT?.5:WX.kind==='shower'?.3:.06));
  WX.cover+=(WK.cover-WX.cover)*wr; WX.dark+=(WK.dark-WX.dark)*wr; WX.rain+=(WK.rain-WX.rain)*wr*(WK.rain>WX.rain?1:1.6); WX.wind+=(WK.wind-WX.wind)*wr; WX.storm+=(WK.storm-WX.storm)*wr;
  cloudy=WX.cover>.6;
  if(WX.storm>.5&&t>WX.nextBolt){WX.flash=1;bolt.strike(who.position.x,who.position.z);setTimeout(function(){sfx('thunder',null,0,0,.85,.9+Math.random()*.2)},500+Math.random()*1800);WX.nextBolt=t+3+Math.random()*9}
  WX.flash=Math.max(0,WX.flash-dt*3.2);
  skyC.copy(C_NIGHT).lerp(C_DAY,light).lerp(C_DUSK,dusk*0.5*(1-WX.dark)); skyC.lerp(C_GREY,WX.cover*.4*light); tmpC2.copy(C_STN).lerp(C_STD,light); skyC.lerp(tmpC2,WX.dark*.8); skyC.lerp(C_FLASH,WX.flash*.55);
  bolt.L.material.opacity=WX.flash>.45?1:0;
  scene.fog.near=lerp(170,38,Math.max(WX.rain*.75,WX.storm)); scene.fog.far=lerp(640,210,Math.max(WX.rain*.7,WX.storm));
  // 하늘 그라데이션: 낮에는 하늘색 위로 짙은 파랑, 밤에는 짙은 군청 위에서 수평선으로 밝은 파랑이 번진다. 흐리면 고르게 탁해진다
  var nightK=(1-light)*(1-WX.cover*.75)*(1-WX.dark*.6), clearK=(1-WX.cover*.8)*(1-WX.dark);
  tmpC2.copy(skyC).multiplyScalar(.62+.3*WX.cover); SKYG.uZen.value.copy(tmpC2).lerp(C_NZEN,nightK).convertSRGBToLinear();
  C_HORS.copy(skyC).lerp(C_WHITE,.22*light*clearK).lerp(C_NHOR,nightK); cloudSys.U.uHz.value.copy(C_HORS); SKYG.uHor.value.copy(C_HORS).convertSRGBToLinear();
  SKYG.uGlow.value.copy(SKYG.uHor.value).lerp(C_GLOWW,.5).multiplyScalar((.18*light+.9*nightK)*clearK+WX.flash*.3);
  scene.background=skyC; fogC.copy(SKYG.uHor.value); scene.fog.color.copy(fogC);
  hemi.intensity=0.15+0.45*light; hemi.color.copy(HEMI_N).lerp(HEMI_D,light); sun.intensity=(.72*(1-.82*WX.dark))*light+(1-light)*.2*(1-WX.cover*.85); hemi.intensity*=1-.4*WX.dark; hemi.intensity+=WX.flash*1.8;
  var sa=(t/DAY%1)*Math.PI*2;
  var mA=sa+Math.PI; moonDir.set(Math.cos(mA)*.75,Math.sin(mA)*.8+.12,.5).normalize(); sunDirV.set(Math.cos(sa)*90,Math.max(e,0.08)*110+25,55).normalize();
  var dayK=smoothstep(.15,.45,light); tmpV.copy(moonDir).lerp(sunDirV,dayK).normalize(); sun.shadow.radius=2-dayK; if(tmpV.y<.62){var hl=Math.hypot(tmpV.x,tmpV.z)||1,hk=Math.sqrt(1-.62*.62)/hl;tmpV.x*=hk;tmpV.z*=hk;tmpV.y=.62} // 해·달이 낮아도 그림자는 키의 1.3배 안쪽 sun.color.copy(MOON_C).lerp(SUN_C,dayK);
  sun.target.position.copy(who.position); sun.position.copy(who.position).addScaledVector(tmpV,135);
  // 색온도: 맑은 낮은 살짝 따뜻하게, 해 질 녘은 주황빛, 흐리거나 비가 오면 차가운 회청색, 밤은 푸르게
  tmpC2.copy(SUN_C).lerp(C_DUSKSUN,dusk*.8*(1-WX.dark)).lerp(C_OVSUN,WX.cover*.6).lerp(C_STSUN,WX.dark*.9); sun.color.copy(MOON_C).lerp(tmpC2,dayK);
  hemi.color.lerp(C_OVSKY,WX.dark*.75*light);
  var ph=(t/DAY)%1; skyU.uLST.value=(18+(ph-.75)*24)*Math.PI/12; skyU.uNight.value=(1-light)*(1-WX.cover*.93); skyU.uTime.value=t;
  moon.g.position.copy(moonDir).multiplyScalar(620); var mv2=(1-light)*smoothstep(-.05,.08,moonDir.y); moon.g.visible=mv2>.01; moon.m.material.opacity=Math.min(1,mv2*1.3)*(cloudy?.35:1); moon.halo.material.opacity=.35*mv2*(cloudy?.3:1);
  sunBall.position.set(Math.cos(sa)*520,e*380,240); sunBall.visible=WX.cover<.75;
  // 구름 빛깔: 낮에는 흰빛, 해 질 녘에는 노을빛, 밤에는 달빛을 받은 회청색. 궂은 날일수록 어둡다
  cLit.setRGB(1,1,1).lerp(tmpC2.setRGB(1,.72,.55),dusk*.7*(1-WX.dark)).multiplyScalar(.18+.82*light).lerp(tmpC2.setRGB(.42,.46,.52),WX.dark*.75*light).multiplyScalar(1-WX.dark*.3);
  if(light<.5)cLit.lerp(tmpC2.setRGB(.2,.3,.56),(1-light*2)*(1-WX.dark*.5));
  cLit.lerp(C_FLASH,WX.flash*.6); cShd.copy(cLit).multiplyScalar(.6-WX.dark*.15).lerp(tmpC2.setRGB(.35,.4,.5),.25);
  cloudSys.update(dt,t,WX.wind,Math.cos(Math.atan2(state.wz,state.wx)),Math.sin(Math.atan2(state.wz,state.wx)),WX.cover,WX.dark,WX.storm,cLit,cShd);

  // 물때와 파도: 물결과 거품은 셰이더가 그리고, 여기서는 같은 식으로 물가 높이만 구해 젖은 모래와 발자국에 쓴다
  var tideP=tideAngle(W.seed,Date.now()); W.sea=Math.sin(tideP)*0.24; W.seaRising=Math.cos(tideP)>0;
  var U=waterU; U.uTime.value=t; windU.value=t; grassU.c.value.set(who.position.x,who.position.z); for(var gq=0;gq<W.patches.length;gq++)updPatch(W.patches[gq],who.position.x,who.position.z); U.uSea.value=W.sea; U.uCalm.value=calm; U.uLight.value=light;
  U.uSunDir.value.set(Math.cos(sa)*90,Math.max(e,0.08)*110+25,55).normalize();
  U.uSunCol.value.setRGB(1,0.93,0.8).multiplyScalar((cloudy?0.2:1)*light);
  U.uSky.value.copy(fogC); U.uFog.value.copy(fogC); U.uMoonDir.value.copy(moonDir); U.uMoonI.value=(1-light)*(1-WX.cover*.9)*smoothstep(-.02,.1,moonDir.y);
  // 모닥불: 해가 지면 저절로 붙고 해가 뜨면 꺼진다. 불빛은 일렁이고 자리도 조금씩 흔들려 그림자가 떨린다
  state.fire+=((e<0.04?1:0)-state.fire)*Math.min(1,dt*1.2); updFlyLog(dt); state.boost=Math.max(0,state.boost-dt*.33); var fb2=state.boost*state.fire;
  var FR=W.fire, fl=state.fire*(1-.55*WX.rain), fk=0.9+0.06*Math.sin(t*5.1)+0.04*Math.sin(t*8.3+1.3)+WX.wind*.06*Math.sin(t*9.7);
  if(!FR.tilt){var fpar=FR.flames[0].parent,ftg=new THREE.Group();ftg.position.y=.1;fpar.add(ftg);FR.flames.forEach(function(f){f.position.y=0;ftg.add(f)});FR.tilt=ftg;var fq=new THREE.Quaternion();fpar.getWorldQuaternion(fq);FR.invQ=fq.conjugate()}
  var lw=tmpV.set(Math.cos(Math.atan2(state.wz,state.wx)),0,Math.sin(Math.atan2(state.wz,state.wx))).applyQuaternion(FR.invQ),ftl=WX.wind*(.55+.25*Math.sin(t*2.3));FR.tilt.rotation.set(lw.z*ftl,0,-lw.x*ftl);
  fireLight.intensity=fl*fk*2.3*(1+.85*fb2); fireLight.shadow.autoUpdate=fl>.01; // 불이 꺼져 있으면 그림자 지도(6방향)를 다시 그리지 않는다. castShadow를 바꾸면 셰이더를 모두 다시 컴파일하므로 그대로 둔다
fireLight.position.set(FR.pos.x+Math.sin(t*3.1)*.03,FR.pos.y+.7,FR.pos.z+Math.cos(t*2.7)*.03);
  U.uFireP.value.copy(fireLight.position); U.uFireI.value=fl*fk;
  // 불길: 불 세기만큼 커지고, 장작을 넣으면 잠깐 더 높고 거칠게 타오른다. 상자 밑면은 장작 위에 두고 바람에 기운다
  {var FV=FR.flames[0],FU=FV.material.uniforms,fg=1+.45*fb2,fw=.95*fl*(1+.15*fb2),fh=1.45*fl*fg;FV.visible=fl>0.01;
    FV.scale.set(Math.max(fw,.001),Math.max(fh,.001),Math.max(fw,.001));FV.position.y=fh*.5-.04;FV.updateMatrixWorld();
    FU.time.value=t;FU.invModelMatrix.value.copy(FV.matrixWorld).invert();FV.getWorldScale(FU.scale.value);FU.uK.value=Math.min(1,fl*1.2);FU.magnitude.value=1.2+.3*fb2}
  FR.glow.material.opacity=fl*(.3+.04*fk)*(1+.5*fb2); FR.logM.emissiveIntensity=fl*fk*3.2; EMBER_U.uFC.value.copy(FR.pos); EMBER_U.uT.value=t;
  // 불빛 번짐은 카메라 쪽으로 당겨 땅에 잘리지 않게 하고, 당긴 만큼 줄여 화면 크기는 그대로 둔다
  var gw=glowW.set(FR.pos.x,FR.pos.y+.55,FR.pos.z),gD=camera.position.distanceTo(gw),gd=Math.min(3.5,gD*.5);
  gw.addScaledVector(glowD.subVectors(camera.position,gw).normalize(),gd);FR.glow.position.copy(FR.glow.parent.worldToLocal(gw));FR.glow.scale.setScalar(4.5*(gD-gd)/gD);
  var spA=FR.sparks.geometry.attributes.position.array;
  for(var sk=0;sk<28;sk++){var sp2=(t*.45+sk*.0357*7.3)%1;spA[sk*3]=Math.sin(sk*12.9)*.22+Math.sin(t*1.3+sk)*.25*sp2+lw.x*WX.wind*sp2*sp2*2.5;spA[sk*3+1]=.3+sp2*sp2*3.2*(1+.7*fb2);spA[sk*3+2]=Math.cos(sk*7.3)*.22+Math.cos(t*1.1+sk*2)*.25*sp2+lw.z*WX.wind*sp2*sp2*2.5}
  FR.sparks.geometry.attributes.position.needsUpdate=true; FR.sparks.material.opacity=fl*Math.min(1,.9+fb2);
  smokeSys.update(dt,FR.pos,state.fire>.05?state.fire*(.35+WX.rain*1.3+WX.wind*.3):0,Math.cos(Math.atan2(state.wz,state.wx)),Math.sin(Math.atan2(state.wz,state.wx)),WX.wind,.3+.7*Math.max(light,state.fire*.6));
  // 바람: 날마다 방향과 세기가 다르고, 간간이 큰 파도가 한 차례씩 밀려온다
  if(t>state.bigT0+12) state.bigT0=t+(16+Math.random()*24)/(1+WX.storm*2.5);
  var bg=t>state.bigT0?Math.pow(Math.sin(Math.PI*(t-state.bigT0)/12),2):0, wa0=windAngle(day), ws=Math.min(1,dt*0.4);
  state.wx+=(Math.cos(wa0)-state.wx)*ws; state.wz+=(Math.sin(wa0)-state.wz)*ws; state.wnd+=(windStrength(W.seed,Date.now())-state.wnd)*ws;
  var wdir=Math.atan2(state.wz,state.wx), wnd=WX.wind, wdx=Math.cos(wdir), wdz=Math.sin(wdir); var wEff=Math.max(WX.wind,state.wnd*.8); windDirU.value.set(wdx,wdz); windStrU.value=wEff; windGP.value+=dt*(1.6+wEff*4); windFP.value+=dt*(1.8+wEff*2.4);
  updTent(t,smoothstep(.3,.75,Math.max(WX.wind,state.wnd*.8)),wdx,wdz);
  causU.sea.value=W.sea+.12; causU.k.value=light*(1-WX.dark*.8);
  U.uBig.value=bg; U.uWind.value=wnd; U.uWindA.value=wdir; U.uStorm.value=WX.storm; U.uRain.value=WX.rain; U.uOver.value=WX.dark;
  var wetTo=WX.rain>.12?1:0; terrWetU.value+=(wetTo-terrWetU.value)*Math.min(1,dt*(wetTo?.12:.015)); rockU.uRW.value=terrWetU.value;
  var N=W.N, swA=W.swash, wetA=W.wet, lo=W.sea-0.06;
  for(var si=0;si<=N;si++){
    var th=si/N*6.2832, wx=t/5.5+0.35*Math.sin(th*2+1)+0.2*Math.sin(th*5)+0.12*Math.sin(th*11+2.3)+0.07*Math.sin(th*19+.7)+9.75, ph=wx-Math.floor(wx), wn=Math.floor(wx);
    var u=(.95+.4*(Math.sin(wn*2.3999+1.3)*.6+Math.sin(wn*.7071)*.4))*(ph<0.32?Math.sin(ph/0.32*1.5708):Math.pow(Math.cos((ph-0.32)/0.68*1.5708),1.6));
    var dw=0.35+0.65*Math.pow(0.5+0.5*Math.cos(th-wdir),1.5);
    var L=W.sea+Math.min(0.6-W.sea,0.03+(0.17+0.05*Math.sin(th*7+2))*(1+(wnd*0.3+bg*0.9)*dw)*u*calm); swA[si]=L;
    // 젖은 모래: 파도가 닿았던 높이에서 멀어질수록 점점 마른 모래 색으로 바뀌고, 시간이 지나면 위에서부터 마른다
    var wtg=Math.min(0.62,L);wetA[si]=wtg>wetA[si]?wetA[si]+(wtg-wetA[si])*Math.min(1,dt*.35):Math.max(wtg,wetA[si]-dt*0.012); if(si<WETN){var wv8=Math.round(clamp((wetA[si]+.6)/1.6,0,1)*255);var lv8=Math.round(clamp((L+.6)/1.6,0,1)*255);wetData[si*4]=wv8;wetData[si*4+1]=lv8;W.rec[si]=Math.max(L,W.rec[si]-dt*.02);wetData[si*4+2]=Math.round(clamp((W.rec[si]+.6)/1.6,0,1)*255);wetData[si*4+3]=255}
  }
  wetTex.needsUpdate=true; W.wetS.visible=false;
  // 발자국은 마른 모래에서 천천히, 파도가 덮을 때마다 빠르게 옅어진다
  var pr=state.prints;
  for(var pi=0;pi<FP;pi++){var fq=pr[pi]; if(!fq)continue;
    fq.s-=swA[fq.bin]>fq.h+0.01?dt*0.55:dt/55;
    if(fq.s<=0){pr[pi]=null;W.prints.setColorAt(pi,WHITE)}
    else{var fk=fq.s*fq.deep;tmpC.setRGB(1-0.34*fk,1-0.38*fk,1-0.44*fk).convertSRGBToLinear();W.prints.setColorAt(pi,tmpC)}
    W.prints.instanceColor.needsUpdate=true}

  // 걷기
  var mvx=0, mvz=0;
  if(!modalOpen&&!saverOn&&WR.mode!=='draw'){
    var f=(keys['w']||keys['arrowup']?1:0)-(keys['s']||keys['arrowdown']?1:0), r=(keys['d']||keys['arrowright']?1:0)-(keys['a']||keys['arrowleft']?1:0);
    if(f||r){state.target=null;state.pickB=null;W.marker.visible=false;var fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw);mvx=fx*f-fz*r;mvz=fz*f+fx*r}
    else if(state.target){var dx=state.target.x-who.position.x,dz=state.target.z-who.position.z,dl=Math.hypot(dx,dz);if(dl<0.4){state.target=null;W.marker.visible=false}else{mvx=dx/dl;mvz=dz/dl}}
  }
  var ml=Math.hypot(mvx,mvz);
  // 앉으러 가는 중에 다른 곳을 누르거나 방향키를 쓰면 그만두고, 앉아 있을 때 움직이려 하면 먼저 일어선다
  if(state.sit==='seat'){if(f||r||(state.target&&state.target!==state.seatTarget)){state.sit='none';syncSit()}else if(!state.target)beginSit(true)}
  if(state.sit!=='none'&&state.sit!=='seat'){if(ml>0&&(state.sit==='down'||state.sit==='sitting')){state.sit='up';syncSit()}if(ml>0&&state.sit==='lie'){state.sit='unlie';syncSit()}mvx=0;mvz=0;ml=0}
  // 아무것도 하지 않고 3분 동안 서 있으면 그 자리에 저절로 앉는다. 물이 닿는 자리, 글쓰기·화면보호·창이 열려 있을 때는 앉지 않는다
  if(state.sit==='none'&&!WR.mode&&!modalOpen&&ml===0&&!state.target&&state.throwT<=0){state.idleT=(state.idleT||0)+dt;if(state.idleT>180){state.idleT=0;autoSit()}}else state.idleT=0;
  if(ml>0){mvx/=ml;mvz/=ml;var nx2=who.position.x+mvx*8.5*dt,nz2=who.position.z+mvz*8.5*dt;
    if(W.height(nx2,nz2)>-0.4){who.position.x=nx2;who.position.z=nz2;state.walk+=dt*9;
      state.stepD+=8.5*dt;if(state.stepD>1.05){state.stepD=0;state.foot=-state.foot;stepSfx(nx2,nz2);stamp(nx2+mvz*0.17*state.foot,nz2-mvx*0.17*state.foot,Math.atan2(mvx,mvz));footSplash(nx2+mvz*0.17*state.foot+mvx*.3,nz2-mvx*0.17*state.foot+mvz*.3,1)}
      var want=Math.atan2(mvx,mvz),dy=want-who.rotation.y;while(dy>Math.PI)dy-=6.283;while(dy<-Math.PI)dy+=6.283;who.rotation.y+=dy*Math.min(1,dt*12)}
    else{state.target=null;W.marker.visible=false;ml=0}}
  who.position.y=W.height(who.position.x,who.position.z);
  // 병을 눌러 걸어가는 중: 도착하면 병 쪽을 보고 줍는다. 가다가 멈췄거나(막힘) 병이 사라졌으면 그만둔다
  if(state.pickB){var pk=state.pickB;
    if(state.beach.indexOf(pk)<0||modalOpen||saverOn||WR.mode)state.pickB=null;
    else if(!state.target&&state.sit==='none'){var pdx=pk.mesh.position.x-who.position.x,pdz=pk.mesh.position.z-who.position.z;state.pickB=null;
      if(Math.hypot(pdx,pdz)<1.6){who.rotation.y=Math.atan2(pdx,pdz);readBottle(pk)}}}
  var mv=ml>0?1:0, sw=mv*Math.sin(state.walk), cw=mv*Math.cos(state.walk), ek=Math.min(1,dt*14);
  easeX(P.legL,sw*.7,ek); easeX(P.legR,-sw*.7,ek); easeX(P.kneeL,Math.max(0,-cw)*1.05,ek); easeX(P.kneeR,Math.max(0,cw)*1.05,ek);
  easeX(P.armL,-sw*.6,ek); easeX(P.elbL,-.15-Math.max(0,sw)*.55,ek);
  if(state.throwT>0){state.throwT-=dt;P.armR.rotation.x=-2.6*clamp(state.throwT/.3,0,1);P.elbR.rotation.x=-.3}
  else{easeX(P.armR,sw*.6,ek); easeX(P.elbR,-.15-Math.max(0,-sw)*.55,ek)}
  P.up.position.y=mv?Math.abs(cw)*.06:Math.sin(t*1.7)*.012; P.up.rotation.z=sw*.03;
  P.head.rotation.y+=((mv?0:Math.sin(t*.45)*.4)-P.head.rotation.y)*Math.min(1,dt*3); P.head.rotation.x=mv?0:Math.sin(t*.31)*.06;
  // 눈 깜빡임: 2~7초마다 불규칙하게, 0.05초에 감고 0.08초에 뜬다. 다섯 번에 한 번쯤은 두 번 연달아 깜빡인다
  if(P.blinkAt===undefined)P.blinkAt=t+2+Math.random()*3;
  if(t>=P.blinkAt+.13){P.blinkAt=Math.random()<.2&&!P.blinkTwice?t+.12:t+2+Math.random()*5;P.blinkTwice=P.blinkAt-t<.2}
  var bk=t-P.blinkAt,bl=bk<0?1:bk<.05?1-bk/.05*.88:bk<.13?.12+(bk-.05)/.08*.88:1; P.eyes[0].scale.y=1.4*bl; P.eyes[1].scale.y=1.4*bl;
  updSit(dt,t,who,P); updWrite(dt,t,who,P); updSandAreas(dt);
  // 눈의 흰 반짝임은 눈을 감거나 깜빡이는 동안 숨긴다(남아 있으면 감은 눈이 뜬 것처럼 보인다)
  var eyeOpen=P.eyes[0].scale.y>.8; P.glints[0].visible=eyeOpen; P.glints[1].visible=eyeOpen;

  // 도착 예약: 병이 2개 이하일 때만, 시연에서는 0.6~2.2일 뒤
  if(NET||total()>=3) state.nextAt=null;
  else if(state.nextAt===null) state.nextAt=t+40*(0.6+state.rng()*1.6);
  else if(t>=state.nextAt){state.nextAt=null;var wa2=windAngle(day)+(state.rng()-.5)*1.2;addBeachBottle(nextLetter(),wa2,false)}

  // 해변의 병
  nearThing=null;
  for(var k=0;k<state.beach.length;k++){var b=state.beach[k];
    if(b.arrive<1)b.arrive=Math.min(1,b.arrive+dt/12);
    var out=(1-sm(b.arrive))*30, bx=b.x+Math.cos(b.angle)*out, bz=b.z+Math.sin(b.angle)*out;
    // 떠밀려 오는 동안은 누워서 일렁이고, 닿으면 모래에 비스듬히 박힌다
    var ga=sm(b.arrive),gh=W.height(bx,bz),fy=Math.max(gh,W.sea+Math.sin(t*1.4+b.phase)*.08)+.2,wsh=b.arrive>=1&&W.swash[binOf(bx,bz)]>gh?1:0;
    b.mesh.position.set(bx,lerp(fy,gh-.16,ga*ga),bz); b.mesh.rotation.x=Math.sin(t*1.1+b.phase)*.12*(1-ga)+wsh*Math.sin(t*3+b.phase)*.03; b.mesh.rotation.z=lerp(1.45,b.tilt,ga);
    if(b.letter.kind!=='rule'&&b.arrive>=1&&t-b.born>160){b.born=t;b.angle=b.angle+2+state.rng()*2;var ns=W.shore(b.angle);b.x=ns.x;b.z=ns.z;b.arrive=0} // 밀물이 가져가 다른 곳에 놓는다
    updSparkles(b,dt,t,who);
  }
  glassMat.emissiveIntensity=.1+Math.max(0,Math.sin(t*2.2))*.3;
  if(!nearThing&&Math.hypot(W.radioPos.x-who.position.x,W.radioPos.z-who.position.z)<4.6)nearThing={type:'radio'};
  if(!nearThing&&CAN_WRITE&&state.bottles>0&&onSand(who.position.x,who.position.z))nearThing={type:'write'};
  var act=$('action'), label=nearThing?(nearThing.type==='radio'?(radio.on?'라디오를 끈다':'라디오를 켠다'):'편지를 쓴다'):'';
  if(modalOpen||saverOn||WR.mode||!nearThing){if(!act.hidden)act.hidden=true}else{if(act.textContent!==label)act.textContent=label;if(act.hidden)act.hidden=false}

  // 던진 병
  for(var j=state.flying.length-1;j>=0;j--){var fb=state.flying[j];fb.t+=dt;
    if(fb.t<1.1){var u=fb.t/1.1;fb.mesh.position.set(lerp(fb.fx,fb.tx,u),lerp(fb.fy,W.sea+.1,u)+Math.sin(u*Math.PI)*4,lerp(fb.fz,fb.tz,u));fb.mesh.rotation.x+=dt*9}
    else{var v=fb.t-1.1;fb.mesh.rotation.x=0;fb.mesh.rotation.z=1.3;fb.mesh.position.set(fb.tx+fb.ox*v*2.4,W.sea+.14+Math.sin(t*1.5)*.08,fb.tz+fb.oz*v*2.4);
      if(v>26){world.remove(fb.mesh);state.flying.splice(j,1)}}}

  // 물속에 서 있으면 다리 둘레로 잔물결이 인다
  for(var fr2=0;fr2<6;fr2++)waterU.uFoot.value[fr2].z+=dt;
  state.ripT=(state.ripT||0)-dt; if(state.ripT<=0&&state.sit==='none'){state.ripT=1.3;if(waterDepth(who.position.x,who.position.z)>.04)footRipple(who.position.x,who.position.z,.35)}

  // 바위, 게, 갈매기
  rockU.uSea.value=W.sea; updCrabs(dt,t,who); updGulls(dt,t,who,e); updChicks(dt,t,who); updWhale(dt,t,who,light); updDolphins(dt,t,who,light); nightShip.update(dt,t,who,light); skyBirds.update(dt,t,who,light);


  // 카메라
  // 아래로 끌어 카메라를 낮추면 시선이 하늘로 올라간다
  var pc=Math.max(state.pitch,.18), lookUp=Math.tan(Math.max(0,.18-state.pitch)*1.6)*state.dist;
  var cp=Math.cos(pc), cx=who.position.x+Math.sin(state.yaw)*cp*state.dist, cz=who.position.z+Math.cos(state.yaw)*cp*state.dist, cy=who.position.y+1.6+Math.sin(pc)*state.dist;
  cy=Math.max(cy,Math.max(W.height(cx,cz),W.sea)+1.5);
  // 내려다볼 때는 야자수가 시야를 가리지 않게 잠시 감춘다
  var treeVis=WR.camK<.55; for(var tv=0;tv<W.trees.length;tv++)W.trees[tv].visible=treeVis;
  // 모래글쓰기: 하늘에서 쓸 자리를 곧장 내려다보는 시점으로 부드럽게 옮겨 간다. 화면 위쪽이 캐릭터가 바라보는 쪽이다
  WR.camK+=((WR.mode==='draw'?1:0)-WR.camK)*Math.min(1,dt*3); var ck=smoother(clamp(WR.camK,0,1));
  var lx=who.position.x,ly=who.position.y+1.8+lookUp,lz=who.position.z;
  if(ck>.001){cx=lerp(cx,WR.center.x-WR.face.x*.02,ck);cy=lerp(cy,WR.center.y+15,ck);cz=lerp(cz,WR.center.z-WR.face.z*.02,ck);lx=lerp(lx,WR.center.x,ck);ly=lerp(ly,WR.center.y,ck);lz=lerp(lz,WR.center.z,ck);camera.up.set(WR.face.x*ck,1-ck,WR.face.z*ck).normalize()}else camera.up.set(0,1,0);
  camera.position.set(cx,cy,cz); camera.lookAt(lx,ly,lz);
  updAudio(dt,t);
  rainSys.update(dt,camera.position,WX.rain,WX.wind,wdx,wdz,light);
  windLines.update(dt,who,camera,Math.max(WX.wind,state.wnd*.8),wdx,wdz,light,WR.camK<.3);

  // 글자 표시
  if(saverOn)updSaverClock();
  statusT-=dt; if(statusT<=0){statusT=.5; setClock();
    $('status').textContent=islandDay()+'일째 · '+(e<0?'밤':e<0.3?'해 질 녘':'낮')+' · '+WX_KIND[WX.kind].name+' · '+(W.seaRising?'밀물':'썰물');}
  gradeT-=dt; if(gradeT<=0){gradeT=.25;
    var tmp=light*(.15*(1-WX.cover))+dusk*.75*(1-WX.dark)-(1-light)*.45-WX.cover*.25*light-WX.rain*.25-WX.storm*.25;tmp=clamp(tmp,-1,1);
    var ge=$('grade');ge.style.background=tmp>0?'#ffad5c':'#5f8dff';ge.style.opacity=(Math.abs(tmp)*.42).toFixed(3);
    canvas.style.filter='saturate('+(1.07-.28*WX.dark-.08*WX.rain).toFixed(3)+') contrast('+(1.03-.06*WX.dark).toFixed(3)+')'}
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').classList.add('off')}

  renderer.render(scene,camera);
  if(shotReq){shotReq=false;takePhoto()}
}

buildIsland(islandSeed); resize(); syncSet();
(function(){var k=weatherKind(islandSeed,Date.now()),auto=true;
  try{auto=localStorage.getItem('bottle-island-wxauto')!=='0';var fk=localStorage.getItem('bottle-island-wxkind');if(!auto&&fk&&WX_KIND[fk])k=fk}catch(e){}
  var K=WX_KIND[k];WX.kind=k;WX.auto=auto;WX.until=0;WX.cover=K.cover;WX.dark=K.dark;WX.rain=K.rain;WX.wind=K.wind;WX.storm=K.storm})();
if(NET){netSync(true);setInterval(netSync,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)netSync()})}
else toast('해변 어딘가에 병이 하나 밀려와 있습니다. 걸어서 찾아보세요.',9);
// 서버의 해변과 맞춘다: 손에 든 병 수, 새로 닿은 병은 놓고 사라진 병은 치운다
function netSync(first){
  NET.beach().then(function(d){
    state.bottles=d.held; syncShelf();
    var ids={}; d.beach.forEach(function(x){ids[x.id]=1});
    state.beach.slice().forEach(function(b){if(b.letter.kind==='net'&&!ids[b.letter.id])removeBeach(b)});
    var have={}; state.beach.forEach(function(b){have[b.letter.id]=1});
    var added=0;
    d.beach.forEach(function(x){if(have[x.id])return;
      // 첫 규칙 편지는 시작 자리 가까이에 둔다
      var a=(first&&x.rule===1)?state.ths+0.55:x.angle;
      addBeachBottle({kind:'net',id:x.id,rule:x.rule},a,!!first);added++});
    if(first&&state.beach.length) toast('해변 어딘가에 병이 하나 밀려와 있습니다. 걸어서 찾아보세요.',9);
    else if(!first&&added) toast('파도가 무언가를 해변으로 밀어 올렸습니다.',6);
  }).catch(function(e){console.error(e)});
}
requestAnimationFrame(frame);
}
