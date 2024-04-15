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
int wall = texture(wallTex, texCoord)[0];

float val = col[3] * 1.0;


if(wall != 0){
fragmentColor = vec4(0,0,0,1);
}else if(val > 0.0){
  fragmentColor = vec4(1.0, 1.0 - val, 1.0 - val, 1.0);
}else{
fragmentColor = vec4(1.0 + val, 1.0 + val, 1.0, 1.0);
}

}