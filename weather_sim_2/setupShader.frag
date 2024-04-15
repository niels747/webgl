#version 300 es
precision highp float;

uniform float dryLapse; 
uniform vec2 texelSize;

uniform float initial_T[300];

in vec2 texCoord;

#include functions

layout(location=0) out vec4 base;
layout(location=1) out vec4 water;
layout(location=2) out ivec2 wall;


float rand(float n){return fract(sin(n) * 43758.5453123);}

float noise(float p){
	float fl = floor(p);
  float fc = fract(p);
	return mix(rand(fl), rand(fl + 1.0), fc);
}


void main()
{
base = vec4(0.0);

base[3] = initial_T[int(texCoord.y * (1.0 / texelSize.y))]; // set temperature

float realTemp = potentialToRealT(base[3]);

if(texCoord.y < 0.15)
water[0] = maxWater(realTemp - 1.0);
else
water[0] = maxWater(realTemp - 10.0);


water[1] = max(water[0] - maxWater(realTemp), 0.0); // calculate cloud water

// WALL SETUP

float height = 0.0;

height = (noise(texCoord.x*50.0 + 546.12)*0.15+sin((texCoord.x - 0.2)*5.0)*0.20  + noise(texCoord.x*300.0)*0.02) - 0.1; // generate mountains



  if(texCoord.y < texelSize.y || texCoord.y < height){ 

  if(height < texelSize.y)
  wall[0] = 1; // set walltype to water
  else
  wall[0] = 1; // set walltype to land
  wall[1] = 0; // set to wall
  }else{
  wall[1] = 255;
  }
}