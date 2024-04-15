#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;

in vec2 texCoordX0Yp; // up
in vec2 texCoordX0Ym; // down

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D lightTex;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float sunAngle;
uniform float waterTemperature;

uniform float sunIntensity;

out vec4 light;

uniform float dryLapse; 
#include functions


void main()
{
if(fragCoord.y > resolution.y - 1.)
light = vec4(sunIntensity ,0,0,0); // full sun, no IR
else{

float adjSunAngle; // adjusted sun angle

// sunlight calculation

if(sunIntensity == 0.0) adjSunAngle = sunAngle; // 1.48353 night 85 deg angle
else adjSunAngle = sunAngle;

vec2 ray = vec2(sin(adjSunAngle) * texelSize.x, cos(adjSunAngle) * texelSize.y);
vec2 sampleCoord = texCoord + ray;
float sunlight = texture(lightTex, sampleCoord)[0];
//float liquidWater = texture(waterTex, sampleCoord)[1]; // cloudwater



float realTemp = potentialToRealT(texture(baseTex, texCoord)[3]);
vec4 water = texture(waterTex, texCoord);
ivec2 wall = texture(wallTex, texCoord).xy;


if(wall[1] != 0){ // is not wall

float net_heating = 0.0;

float lightReflected = sunlight - (sunlight / (water[1]*0.025 + water[2]*0.025 + 1.)); // cloud + precipitation
float lightAbsorbed  = sunlight - (sunlight / (water[3]*0.010 + 1.)); // smoke

sunlight -= lightReflected + lightAbsorbed;

net_heating += lightAbsorbed * 0.002 * sunIntensity;

// longwave / IR calculation
float IR_down = texture(lightTex, texCoordX0Yp)[2];
float IR_up;



if(wall[1] == 1){ // at surface

if(wall[0] == 1){ // if land, IR only affects land
  IR_up = IR_emitted(realTemp); // emissivity = 1.0
  net_heating += IR_down - IR_up;
//  net_heating *= 0.5;
}else if(wall[0] == 2){ // if water surface
IR_up = IR_emitted(waterTemperature); // emissivity = 1.0
}else if(wall[0] == 3){ // if fire
  IR_up = IR_emitted(realTemp); // emissivity = 1.0
   net_heating = 0.0;
  // IR_down = 0.0;
  // sunlight = 1.0;
}

}else{
  
  IR_up = texture(lightTex, texCoordX0Ym)[3];

float emissivity; // how opage it is too ir, the rest is let trough, no reflection
emissivity = 0.001; // 0.005 greenhouse gasses
emissivity += water[0] * 0.0025; // water vapor
emissivity += water[1] * 1.5; // cloud water
emissivity += water[3] * 0.01; // smoke

emissivity = min(emissivity, 1.0);

float absorbedDown = IR_down * emissivity;
float absorbedUp = IR_up * emissivity;
float emitted = IR_emitted(realTemp) * emissivity; // this amount is emitted both up and down

net_heating += absorbedDown + absorbedUp - emitted*2.0;

IR_down -= absorbedDown;
IR_down += emitted;

IR_up -= absorbedUp;
IR_up += emitted;
}

light = vec4(sunlight, net_heating, IR_down, IR_up);
//light = vec4(1, 0, 0, 0);
}else{ // is wall
light = vec4(sunlight * 0.8, 0, 0, 0); // * 0.8 light absorbed by ground
}
}
}

