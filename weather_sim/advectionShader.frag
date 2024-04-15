#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;

uniform vec4 userInputValues; // xpos   Ypos   intensity   Size    
uniform int userInputType; // 0 = nothing 	1 = temp	 2 = wall	3 = heating wall	4 = cooling wall

uniform float dryLapse; 
uniform float evapHeat;

layout(location=0) out vec4 base;
layout(location=1) out vec4 water;
layout(location=2) out ivec2 wall;

uniform vec2 texelSize;

uniform float initial_T[300];

#include functions

void main()
{
  wall = texture(wallTex, texCoord).xy;
  vec4 prevBase = texture(baseTex, texCoord);

  vec2 backTracedPos = texCoord - vec2(prevBase[0], prevBase[1]) * texelSize;

  base = texture(baseTex, backTracedPos); // the cell is set to a linear texture sample, taken at coordinates upwind of this cell
  water[2] = texture(waterTex, texCoord)[2];
  water.xy = texture(waterTex, backTracedPos).xy;

  //vec2 backTracedWaterPos = backTracedPos + vec2(0.0, 0.00002 + water[2] * 0.0001); // 00005 0001 fall speed depends on density
  vec2 backTracedWaterPos = backTracedPos + vec2(0.0, 0.00009); //  00005 // constant fall speed
  water[2] = texture(waterTex, backTracedWaterPos)[2]; // precipitation falling

  float realTemp = potentialToRealT(base[3]);

  //float oldCloudWater = water[1];
 
  float newCloudWater = max(water[0] - maxWater(realTemp), 0.0); // calculate cloud water

  float dT = (newCloudWater - water[1]) * evapHeat; // how much that water phase change would change the temperature

  float dWt = max(water[0] - maxWater(realTemp + dT), 0.0) - newCloudWater; // how much that temperature change would change the amount of liquid water

  float actualTempChange = dT_saturated(dT, dWt * evapHeat);

  base[3] += actualTempChange;


  float tempC = KtoC(realTemp + actualTempChange);

float relHum = relativeHumd(realTemp, water[0]);
  if(relHum < 1.0 && water[2] > 0.0){
  float evaporation = min((1.0 - relHum) * 0.0003, water[2]); // 0.0002
  
  water[2] -= evaporation;
  water[0] += evaporation;
  base[3] -= evaporation * evapHeat;
}



float treshhold;
float rate;

if(tempC > 0.0){ // only very light precipitation possible (drizzle)
treshhold = 2.0; // 4
rate = 0.000020; // 000020
}
else{
  treshhold = max(map_range(tempC, 0.0, -30.0,0.0, 0.0),0.0); // 0.0, -30.0,2.0, 0.0),0.0);
  rate = map_range(tempC, 0.0, -60.0,0.00005, 0.00010); // 0.0, -60.0,0.0001, 0.000100
}

if(water[1] > treshhold){
float precipitation = (water[1] - treshhold) * rate;
water[0] -= precipitation;
water[2] += precipitation;
}


/*
if(texCoord.y > 0.5){
if(texCoord.y > 0.9)
  base[3] += 0.0001;
  else
  base[3] -= 0.0001;
}*/



// USER INPUT:

bool inBrush = false;

if (userInputValues.x < -0.5){ // whole width brush

if(abs(userInputValues.y - texCoord.y) < userInputValues[3] * texelSize.y)
inBrush = true;
}

vec2 distFromMouse = userInputValues.xy - texCoord;
distFromMouse.x *= texelSize.y / texelSize.x; // aspect ratio correction to make it a circle

if (length(distFromMouse) < userInputValues[3] * texelSize.y) {
  inBrush = true;
}

if(inBrush){
  if (userInputType == 1) { // temperature
    base[3] += userInputValues[2];
  } else if (userInputType == 2) { // water
    water[0] += userInputValues[2];
    water[0] = max(water[0], 0.0);
  }else if (userInputType > 10) { // wall
    if (userInputValues[2] > 0.0) { // build wall if positive value else remove wall

wall[1] = 0; // set wall

switch(userInputType){ // set wall type
case 11: wall[0] = 0; // normal wall
break;
case 12: wall[0] = 1; // heating wall
break;
case 13: wall[0] = 2; // cooling wall
}
    } else {
if(wall[1] == 0 && texCoord.y > texelSize.y){ // remove wall only if it is a wall and not bottem layer
      wall[1] = 255; // remove wall
      base[0] = 0.0; // reset all properties to prevent NaN bug
      base[1] = 0.0;
      base[2] = 0.0; 
      base[3] = initial_T[int(texCoord.y * (1.0 / texelSize.y))];
      water[0] = 0.0;
      water[1] = 0.0;
      water[2] = 0.0;
      }
    }
  }
}
if(wall[1] == 0){ // is wall
base[3] = 999.0; // special temperature, just to identify that it is a wall cell when drawing the graph
water[1] = 0.0; // give walls cloudwater to make them absorb light
}else{
water[1] = max(water[0] - maxWater(realTemp + actualTempChange), 0.0); // recalculate cloud water
}
}

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/