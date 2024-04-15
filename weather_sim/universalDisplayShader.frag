#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D anyTex; // can be any RGBW32F texture
uniform isampler2D wallTex;

uniform int quantityIndex; // wich quantity to display
uniform float dispMultiplier;

out vec4 fragmentColor;

void main()
{
vec4 cell = texture(anyTex, texCoord);
ivec2 wall = texture(wallTex, texCoord).xy;

float val = cell[quantityIndex] * dispMultiplier;


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
}else if(val > 0.0){
  fragmentColor = vec4(1.0, 1.0 - val, 1.0 - val, 1.0);
}else{
fragmentColor = vec4(1.0 + val, 1.0 + val, 1.0, 1.0);
}
}