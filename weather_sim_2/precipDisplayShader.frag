#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;

//uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;

out vec4 fragmentColor;



void main()
{
ivec2 wall = texture(wallTex, texCoord).xy;
vec4 water = texture(waterTex, texCoord);


if(wall[1] == 0){ // is wall
switch(wall[0]){ // wall type
  case 0:
fragmentColor = vec4(0,0,0,1);
break;
  case 1: // land wall
fragmentColor = vec4(vec3(0.10),1); // dark gray rock
break;
  case 2: // water wall
fragmentColor = vec4(0,0.5,0.99,1);
break;
}
}else{

    float g = water[3] * 0.5;
    float b = water[2] * 0.5;

    fragmentColor = vec4(1.0 - g - b, 1.0 - b, 1.0 - g, 1.0);
}
}