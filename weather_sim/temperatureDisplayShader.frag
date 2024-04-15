#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D baseTex;
uniform isampler2D wallTex;

uniform float dryLapse; 

out vec4 fragmentColor;

#include functions

void main()
{
vec4 col = texture(baseTex, texCoord);
ivec2 wall = texture(wallTex, texCoord).xy;

float realTemp = KtoC(potentialToRealT(col[3]));


if(wall[1] == 0){ // is wall
switch(wall[0]){ // wall type
  case 0:
fragmentColor = vec4(0,0,0,1);
break;
  case 1: // land wall
fragmentColor = vec4(0.3,0,0,1);
break;
  case 2: // water wall
fragmentColor = vec4(0,0.5,0.99,1);
break;
}
}else{
  fragmentColor = vec4(hsv2rgb(vec3(max(min(map_range(float(int(realTemp)),-30.0,30.0,1.0,0.0),0.80),0.0),1.0,1.0)),1.0);
}
}