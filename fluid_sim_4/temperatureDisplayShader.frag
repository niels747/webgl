#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D baseTex;
uniform isampler2D wallTex;

out vec4 fragmentColor;

void main()
{
vec4 col = texture(baseTex, texCoord);
ivec2 wall = texture(wallTex, texCoord).xy;

float val = col[3] * 1.0;


if(wall[1] == 0){ // is wall
switch(wall[0]){ // wall type
  case 0:
fragmentColor = vec4(0,0,0,1);
break;
  case 1: // heating wall
fragmentColor = vec4(0.3,0,0,1);
break;
  case 2: // cooling wall
fragmentColor = vec4(0,0,0.3,1);
break;
}
}else if(val > 0.0){
  fragmentColor = vec4(1.0, 1.0 - val, 1.0 - val, 1.0);
}else{
fragmentColor = vec4(1.0 + val, 1.0 + val, 1.0, 1.0);
}

}