// 표준 재질 셰이더를 고쳐 카툰 느낌의 빛과 그림자를 낸다. 한 번만 적용한다
import * as THREE from 'three';

let done = false;
export function patchToonShading() {
  if (done) return;
  done = true;
// 카툰 렌더링: 햇빛이 닿는 면과 그늘을 부드러운 경계로 나누고, 가장자리에 옅은 테두리 빛을 더한다. 모든 표준 재질에 적용된다
{var C=THREE.ShaderChunk;
  for(var k in C){if(typeof C[k]==='string'&&C[k].indexOf('vec3 irradiance = dotNL * directLight.color;')>=0)
    C[k]=C[k].split('vec3 irradiance = dotNL * directLight.color;').join('vec3 irradiance = mix( smoothstep( 0.0, 0.14, dotNL ) * 0.74 + dotNL * 0.26, dotNL, ptL ) * directLight.color;')}
  // 모닥불(점광원)은 카툰 경계 없이 부드럽게 비춘다: 경계를 나누면 불에서 몇 m 떨어진 땅에 빛의 테두리가 둥글게 생긴다.
  // 빛 계산에서 지금 빛이 점광원인지(ptL) 표시해 두고, 테두리 빛과 카툰 반짝임도 해·달에만 쓴다
  C.lights_pars_begin='float ptL=0.;\n'+C.lights_pars_begin;
  C.lights_fragment_begin=C.lights_fragment_begin.replace('getPointDirectLightIrradiance( pointLight, geometry, directLight );','getPointDirectLightIrradiance( pointLight, geometry, directLight );ptL=1.;')
    .replace('getSpotDirectLightIrradiance( spotLight, geometry, directLight );','getSpotDirectLightIrradiance( spotLight, geometry, directLight );ptL=1.;')
    .replace('getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );','getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );ptL=0.;');
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
  // 모닥불 그림자: 아주 옅게(최대 12%), 넓게 번지는 부드러운 모양, 가리는 물체에서 멀어지면 사라진다
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
    '  return mix(s,1.,max(.88,fade));}',
    '#endif'].join('\n')}
  // 테두리 빛과 반짝임: 빛(해·달·모닥불)마다 계산한다(mayacoda/toon-shader(MIT)의 방식을 참고).
  // 테두리 빛은 그 빛을 받는 쪽 가장자리에만 그 빛의 색으로 생기고, 그림자 속이나 빛을 등진 쪽에는 없다. 땅·윗면처럼 위를 향한 면은 빼서
  // 멀리 비스듬히 보이는 땅이 통째로 밝아지지 않게 한다. 반짝임은 매끈한 재질일수록 경계가 또렷한 하이라이트 점으로 바꾼다
  var SPEC='reflectedLight.directSpecular += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Specular_GGX( directLight, geometry.viewDir, geometry.normal, material.specularColor, material.specularRoughness);';
  var DIFF='reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );';
  if(C.lights_physical_pars_fragment.indexOf(SPEC)>=0&&C.lights_physical_pars_fragment.indexOf(DIFF)>=0){
    C.lights_physical_pars_fragment=C.lights_physical_pars_fragment.replace(SPEC,[
      '{vec3 sp=( 1.0 - clearcoatDHR ) * irradiance * BRDF_Specular_GGX( directLight, geometry.viewDir, geometry.normal, material.specularColor, material.specularRoughness);',
      ' float tk=(1.0-smoothstep(0.35,0.6,material.specularRoughness))*(1.-ptL),sl=max(sp.r,max(sp.g,sp.b));',
      ' reflectedLight.directSpecular+=mix(sp,directLight.color*0.85*smoothstep(0.2,0.3,sl),tk);}'].join('\n'))
    .replace(DIFF,DIFF+['',
      '{float rimF=1.0-saturate(dot(geometry.normal,geometry.viewDir)),nl=dot(geometry.normal,directLight.direction);',
      ' float up=dot(geometry.normal,normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz));',
      ' float rimK=smoothstep(0.6,0.8,rimF*pow(saturate(nl),0.2))*(1.0-smoothstep(0.55,0.85,up))*(1.-ptL);',
      ' reflectedLight.directDiffuse+=rimK*directLight.color*mix(material.diffuseColor,vec3(1.),0.25)*0.45;}'].join('\n'))}
}
}
