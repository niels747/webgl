#version 300 es
precision highp float;

in vec2 texCoord;

//layout(location=0) out vec4 cell;
layout(location=1) out ivec2 wall;

uniform vec2 texelSize;


float rand(float n){return fract(sin(n) * 43758.5453123);}

float noise(float p){
	float fl = floor(p);
  float fc = fract(p);
	return mix(rand(fl), rand(fl + 1.0), fc);
}



void main()
{
//cell = vec4(0.0);

wall[0] = 0; // set walltype to normal

float height = sin(texCoord.x*5.0);

  if(texCoord.y < texelSize.y || texCoord.y < noise(texCoord.x*50.0)*0.15*height + noise(texCoord.x*300.0)*0.02) // generate mountains
  wall[1] = 0; // set to wall
  else
  wall[1] = 255;
}