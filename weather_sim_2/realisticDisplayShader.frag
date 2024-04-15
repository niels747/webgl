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

  vec3 visibleWater = texture(waterTex, sampleCoord).yzw; // cloudwater and precipitation

cloudWaterAbove += visibleWater[0]/*+ visibleWater[1] * 1.0 + visibleWater[2] * 1.0*/;
}

float light = min(1.0 / (cloudWaterAbove*0.015 + 1.0), 1.0);

float cloudwater = water[1];

if(wall[1] == 0){ // is wall
switch(wall[0]){ // wall type
  case 0: // normal wall
fragmentColor = vec4(0,0,0,1);
break;
  case 1: // land wall

  vec3 groundCol;

if(water[2] < -998.0){ // not at surface
groundCol = vec3(0.10); // dark gray rock
}else{
groundCol = mix(vec3(0.5,0.2,0.1),vec3(0.0, 0.7, 0.2),min(water[2]*0.0010, 1.0)); // brown to green, dry earth to grass 
groundCol = mix(groundCol,vec3(1.0),min(water[3]*0.0010, 1.0)); // x to white, snow cover
}
fragmentColor = vec4(groundCol * light,1.0); // apply lighting
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


    float precip = water[2] + water[3];

    //if(wall[1] < 3) // prevent white edge on land wall
  // precip = 0.0;

    backgroundCol = mix(backgroundCol, raincol, min(precip*3.0, 1.0));

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