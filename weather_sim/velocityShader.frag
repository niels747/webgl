#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord; // this
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform isampler2D wallTex;

uniform float dragMultiplier;

uniform vec2 texelSize;

uniform float initial_T[300];

layout(location=0) out vec4 base;
layout(location=2) out ivec2 wall;


/* 
// baseTex:
[0] = vx    Horizontal velocity
[1] = vy    Vertical   velocity
[2] = p     Pressure
[3] = t     Temperature
*/

void main()
{
  base = texture(baseTex, texCoord);
  vec4 baseXpY0 = texture(baseTex, texCoordXpY0); 
  vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);

  wall = texture(wallTex, texCoord).xy;
  
  if(wall[1] == 0) // is wall
  {
  base[0] = 0.0; // velocities in wall are 0
  base[1] = 0.0; // this will make a wall not let any pressure trough and thereby reflect any pressure waves back
  }else{

  // The velocity through the cell changes proportionally to the pressure gradient across the cell. It's basically just newtons 2nd law.
  base[0] += base[2] - baseXpY0[2];
  base[1] += base[2] - baseX0Yp[2];

 // base[0] *= 0.9999; // linear drag
 // base[1] *= 0.9999;

  // quadratic drag


  float mult = 1.0 - min(pow(length(base.xy),2.0) * dragMultiplier, 0.5);
 
  base[0] *= mult;
  base[1] *= mult;
  //base[1] -= abs(base[1]) * base[1] * dragMultiplier;

  base[1] += (base[3] - initial_T[int(texCoord.y * (1.0 / texelSize.y))]) * 0.00005; // 0.0001 gravity for convection
}
}