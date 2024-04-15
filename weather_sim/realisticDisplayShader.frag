#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;

uniform float dryLapse;
uniform vec2 texelSize;
uniform float sunAngle;

out vec4 fragmentColor;

#include functions

void main()
{
vec4 base = texture(baseTex, texCoord);
ivec2 wall = texture(wallTex, texCoord).xy;
vec4 water = texture(waterTex, texCoord);

float cloudWaterAbove = 0.0;

vec2 ray = vec2(sin(sunAngle) * texelSize.x, cos(sunAngle) * texelSize.y);

vec2 sampleCoord = vec2(texCoord);

while(sampleCoord.y < 0.99){

  sampleCoord += ray;

  vec2 visibleWater = texture(waterTex, sampleCoord).yz; // cloudwater and precipitation

cloudWaterAbove += visibleWater[0] + visibleWater[1] * 3.0;

//if(wall[1] == 0) cloudWaterAbove += 1.0;
}

float light = min(1.0 / (cloudWaterAbove*0.015 + 1.0), 1.0);

float cloudwater = water[1];

//if(wall[1] < 3) cloudwater = 0.0; // prevent white line around walls when smooth is on


if(wall[1] == 0){ // is wall
switch(wall[0]){ // wall type
  case 0:
fragmentColor = vec4(0,0,0,1);
break;
  case 1: // land wall
fragmentColor = vec4(vec3(0.5,0.2,0.1) * light,1);
break;
  case 2: // water wall
fragmentColor = vec4(vec3(0,0.5,0.99) * light,1);
break;
}
}else{
    vec3 backgroundCol = vec3(0.14,0.31,0.59); // blue sky

    backgroundCol *= 1.0 - texCoord.y * 0.9; // fade to black at the top

   // backgroundCol.r += water[2]/5.0; // purple rain
    
   // backgroundCol /= map_range(water[2],0.0,5.0,1.0,10.0);

    vec3 raincol = vec3(0.9) * light;

    backgroundCol = mix(backgroundCol, raincol, min(water[2] * 2.0, 1.0));

    backgroundCol *= map_range(light,0.0,1.0,0.60,1.0);

    vec3 cloudCol = vec3(1.0 / (cloudwater * 0.1 +1.0) * (light + 0.05));

    float opacity = min(max(cloudwater*4.0, 0.0),1.0);
/*
   if(water[1] > 0.0)
     opacity = 1.0;
     */

    vec3 finalCol = mix(backgroundCol,cloudCol,opacity);

  fragmentColor = vec4(finalCol,1.0);
}
}