// 표준 재질 셰이더를 고쳐 카툰 느낌의 빛과 그림자를 낸다. 한 번만 적용한다
import * as THREE from 'three';

let done = false;
export function patchToonShading() {
  if (done) return;
  done = true;
// 카툰 렌더링: 햇빛이 닿는 면과 그늘을 부드러운 경계로 나누고, 가장자리에 옅은 테두리 빛을 더한다. 모든 표준 재질에 적용된다
{var C=THREE.ShaderChunk;
  for(var k in C){if(typeof C[k]==='string'&&C[k].indexOf('vec3 irradiance = dotNL * directLight.color;')>=0)
    C[k]=C[k].split('vec3 irradiance = dotNL * directLight.color;').join('vec3 irradiance = ( smoothstep( 0.0, 0.14, dotNL ) * 0.74 + dotNL * 0.26 ) * directLight.color;')}
  // 그림자: 가리는 물체에서 멀어질수록 옅어져 끝이 서서히 흐려진다 (해 그림자 깊이 범위 419)
  var SIG='float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {';
  if(C.shadowmap_pars_fragment.indexOf(SIG)>=0){C.shadowmap_pars_fragment=C.shadowmap_pars_fragment.replace(SIG,SIG.replace('getShadow(','getShadowBase('))+[
    '\n#ifdef USE_SHADOWMAP',
    'float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {',
    '  float s=getShadowBase(shadowMap,shadowMapSize,shadowBias,shadowRadius,shadowCoord);if(s>0.999)return s;',
    '  vec3 c=shadowCoord.xyz/shadowCoord.w;c.z+=shadowBias;vec2 tx=3./shadowMapSize;float sum=0.,n=0.;',
    '  for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++){float d=unpackRGBAToDepth(texture2D(shadowMap,c.xy+vec2(float(i),float(j))*tx));if(d<c.z){sum+=d;n+=1.;}}',
    '  if(n<1.)return s;float dist=(c.z-sum/n)*419.;',
    '  float nk=clamp(shadowRadius-1.,0.,1.);', // 밤(달빛)일수록 1: radius 칸을 낮밤 신호로 쓴다
    '  return mix(s,1.,max(.9*smoothstep(.3,4.,dist),nk*.72));}',
    '#endif'].join('\n')}
  // 모닥불 그림자: 옅게(최대 25%), 넓게 번지는 부드러운 모양, 가리는 물체에서 멀어지면 사라진다
  var PSIG='float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {';
  if(C.shadowmap_pars_fragment.indexOf(PSIG)>=0){C.shadowmap_pars_fragment=C.shadowmap_pars_fragment.replace(PSIG,PSIG.replace('getPointShadow(','getPointShadowBase('))+[
    '\n#ifdef USE_SHADOWMAP',
    PSIG,
    '  float ty=1./(shadowMapSize.y*2.);vec3 l2p=shadowCoord.xyz;float rng=shadowCameraFar-shadowCameraNear;float dp=(length(l2p)-shadowCameraNear)/rng+shadowBias;vec3 bd=normalize(l2p);',
    '  vec3 t1=normalize(cross(bd,abs(bd.y)<.95?vec3(0.,1.,0.):vec3(1.,0.,0.)));vec3 t2=cross(bd,t1);',
    '  float sum=0.,n=0.,lit=0.;',
    '  for(int i=0;i<16;i++){float fi=float(i);float r=sqrt((fi+.5)/16.);float an=fi*2.39996;vec3 dv=bd+(t1*cos(an)+t2*sin(an))*r*ty*14.;',
    '    float d=unpackRGBAToDepth(texture2D(shadowMap,cubeToUV(dv,ty)));if(d<dp){sum+=d;n+=1.;}else lit+=1.;}',
    '  if(n<1.)return 1.;float s=lit/16.;s=smoothstep(0.,1.,s);',
    '  float fade=smoothstep(.1,1.4,(dp-sum/n)*rng);',
    '  return mix(s,1.,max(.75,fade));}',
    '#endif'].join('\n')}
  C.lights_fragment_end=C.lights_fragment_end+'\n{float rimF=1.0-saturate(dot(geometry.normal,geometry.viewDir));reflectedLight.indirectDiffuse+=diffuseColor.rgb*smoothstep(0.55,0.95,rimF)*0.22;}';
}
}
