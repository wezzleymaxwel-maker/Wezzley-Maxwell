import * as T from "three";
/** Translucent wisps follow the same safe-circle geometry used for damage. */
export function gasMaterial() {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: `
varying vec2 vUv;
void main(){
 vUv=uv;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}
`,
    fragmentShader: `
uniform float time;
varying vec2 vUv;
float cloud(vec2 p){return sin(p.x*2.3+sin(p.y*2.9))*sin(p.y*1.7+sin(p.x*1.3));}
void main(){
 vec2 p=vec2(vUv.x*125.0,vUv.y*6.0);
 float w=cloud(p+vec2(time*.028,-time*.04))*.5+.5;
 float small=cloud(p*3.0+time*.08)*.5+.5;
 float fade=1.0-smoothstep(.3,1.0,vUv.y);
 float alpha=(.08+.15*w+.035*small)*fade;
 vec3 tint=mix(vec3(.38,.53,.22),vec3(.62,.72,.35),w);
 gl_FragColor=vec4(tint,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`,
  });
}
