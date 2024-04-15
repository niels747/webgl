#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D lightTex;
uniform isampler2D wallTex;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float dryLapse; 

uniform int upOrDown; // 0 = down     1 = up

out vec4 fragmentColor;

#include functions

void main()
{
vec4 light = texture(lightTex, texCoord);
ivec2 wall = texture(wallTex, texCoord).xy;

float IRtemp = KtoC(IR_temp(light[upOrDown+2])); // index 2 or 3


if(wall[1] == 0){ // is wall
switch(wall[0]){ // wall type
  case 0:
fragmentColor = vec4(0,0,0,1);
break;
  case 1: // land wall
fragmentColor = vec4(vec3(0.10),1.0);
break;
  case 2: // water wall
fragmentColor = vec4(0,0.5,0.99,1);
break;
}
}else{

  int palletteIndex;

  if(upOrDown == 1)
  palletteIndex = int(map_range(IRtemp, -26.-2., 30., 0.,29.)); // up
  else
  palletteIndex = int(map_range(IRtemp, -60.-2., 26., 0.,29.)); // down


 palletteIndex = clamp(palletteIndex,0,29);

vec3 palette[] = vec3[](vec3(1.,0.7,1.), vec3(1.,0.5,1.), vec3(1.,0.3,1.), vec3(0.8,0.,0.8), vec3(0.65,0.,0.6), vec3(0.5,0.,0.5), vec3(0.35,0.,0.6), vec3(0.,0.,0.7), vec3(0.,0.,1.), vec3(0.,0.30,1.), vec3(0.,0.44,1.), vec3(0.,0.62,1.0), vec3(0.,0.80,1.0), vec3(0.,1.,1.), vec3(0.,0.50,0.), vec3(0.,0.61,0.0), vec3(0.,0.72,0.), vec3(0.,0.85,0.), vec3(0.,1.,0.), vec3(0.5,1.,0.), vec3(0.80,1.,0.), vec3(1.,1.,0.), vec3(1.,0.8,0.), vec3(1.,0.6,0.), vec3(1.,0.4,0.), vec3(1.,0.,0.), vec3(0.85,0.,0.), vec3(0.72,0.,0.), vec3(0.61,0.,0.), vec3(0.52,0.,0.));


fragmentColor = vec4(palette[palletteIndex], 1.0);
}
}