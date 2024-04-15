#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 texCoordX0Yp; // cell above

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;

uniform vec4 userInputValues; // xpos   Ypos   intensity   Size    
uniform int userInputType; // 0 = nothing 	1 = temp	 2 = wall	3 = heating wall	4 = cooling wall

uniform float dryLapse; 
uniform float evapHeat;
uniform float meltingHeat;

layout(location=0) out vec4 base;
layout(location=1) out vec4 water;
layout(location=2) out ivec2 wall;

uniform vec2 texelSize;

uniform float initial_T[300];

#include functions

// vec4 bilerp (sampler2D tex, vec2 pos) {
//         vec2 st = pos / texelSize - 0.5;

//         vec2 ipos = floor(st);
//         vec2 fpos = fract(st);

//         vec4 a = texture(tex, (ipos + vec2(0.5, 0.5)) * texelSize);
//         vec4 b = texture(tex, (ipos + vec2(1.5, 0.5)) * texelSize);
//         vec4 c = texture(tex, (ipos + vec2(0.5, 1.5)) * texelSize);
//         vec4 d = texture(tex, (ipos + vec2(1.5, 1.5)) * texelSize);

//         return mix(mix(a, b, fpos.x), mix(c, d, fpos.x), fpos.y);
//     }

void main()
{
  wall = texture(wallTex, texCoord).xy;

  float actualTempChange = 0.0, realTemp = 0.0;

if(wall[1] != 0){

  vec4 prevBase = texture(baseTex, texCoord);

  vec2 backTracedPos = texCoord - vec2(prevBase[0], prevBase[1]) * texelSize;

  base = texture(baseTex, backTracedPos); // the cell is set to a linear texture sample, taken at coordinates upwind of this cell
  //base = bilerp(baseTex, backTracedPos);

  //water.zw = texture(waterTex, texCoord).zw; // rain and snow are copied
  water.xy = texture(waterTex, backTracedPos).xy;

  vec2 backTracedRainPos = backTracedPos + vec2(0.0, 0.00005 + water[2] * 0.0002); // 00005 0001 fall speed depends on density
  //vec2 backTracedRainPos = backTracedPos + vec2(0.0, 0.00005); //  00005 // constant fall speed
  water[2] = texture(waterTex, backTracedRainPos)[2]; // rain falling

  vec2 backTracedSnowPos = backTracedPos + vec2(0.0, 0.00005 + water[3] * 0.0002); // 00005 0001 fall speed depends on density
  //vec2 backTracedSnowPos = backTracedPos + vec2(0.0, 0.00005); //  00005 // constant fall speed
  water[3] = texture(waterTex, backTracedSnowPos)[3]; // snow falling



  realTemp = potentialToRealT(base[3]);

  float newCloudWater = max(water[0] - maxWater(realTemp), 0.0); // calculate cloud water

  float dT = (newCloudWater - water[1]) * evapHeat; // how much that water phase change would change the temperature

  float dWt = max(water[0] - maxWater(realTemp + dT), 0.0) - newCloudWater; // how much that temperature change would change the amount of liquid water

  actualTempChange = dT_saturated(dT, dWt * evapHeat);

  base[3] += actualTempChange;


  float tempC = KtoC(realTemp + actualTempChange);

  float relHum = relativeHumd(realTemp, water[0]);

  if(relHum < 1.0 && water[2] > 0.0){ // rain evaporation
  float evaporation = min((1.0 - relHum) * 0.00008, water[2]); // 0.0003
  water[2] -= evaporation;
  water[0] += evaporation;
  base[3] -= evaporation * evapHeat;
}

  if(relHum < 1.0 && water[3] > 0.0){ // snow sublimation
  float sublimation = min((1.0 - relHum) * 0.00005, water[3]); // 0.0002
  water[3] -= sublimation;
  water[0] += sublimation;
  base[3] -= sublimation * (evapHeat + meltingHeat);
}

if(tempC > 0.0 && water[3] > 0.0){ // snow melting
float melting = min(tempC * (water[3] + 1.0) * 0.0001, water[3]);
water[3] -= melting;
water[2] += melting;
base[3] -= melting * meltingHeat;
}else if(tempC < 0.0 && water[2] > 0.0){ // rain freezing
float freezing = min(-tempC * (water[2] + 1.0) * 0.0001, water[2]);
water[2] -= freezing;
water[3] += freezing;
base[3] += freezing * meltingHeat;
}

float treshhold;
float rate;

if(tempC > 0.0){ // only very light rain possible if clouds are very dense(drizzle)
treshhold = 2.0; // 2
rate = 0.000010; // 000020
}
else{
  treshhold = max(map_range(tempC, 0.0, -30.0,0.0, 0.0),0.0); // 0.0, -30.0,2.0, 0.0),0.0);
  rate = map_range(tempC, 0.0, -60.0,0.002, 0.01); // 0.0, -60.0,0.00002, 0.0001
}


if(water[1] > treshhold){
float precipitation = min(pow(water[1] - treshhold, 2.0) * rate * 0.005, water[1]);


water[0] -= precipitation;

if(tempC > 0.0){
water[2] += precipitation;
}else{
water[3] += precipitation;
base[3] += precipitation * meltingHeat;
}
}


if(texCoord.y > 0.2){
  water[0] -= 0.000005; // drying
if(texCoord.y > 0.8)
  base[3] += 0.00002; // stratosperic heating
  // else
  // base[3] -= 0.0000;
}

water[0] = max(water[0],0.0); // prevent water from going negative

}else{ // this is wall

water = texture(waterTex, texCoord);

ivec2 wallX0Yp = texture(wallTex, texCoordX0Yp).xy;

if(wallX0Yp[1] != 0){ // cell above is not wall

water[2] = max(water[2], 0.0); 

vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);
vec4 waterX0Yp = texture(waterTex, texCoordX0Yp);

if(waterX0Yp[3] > 0.0){
water[3] = min(water[3] + waterX0Yp[3], 1000.0); // snow acumulating on ground
}

if(waterX0Yp[2] > 0.0){
water[2] = min(water[2] + waterX0Yp[2], 1000.0); // water acumulating in ground, causing vegetation to grow (green color)
}

realTemp = KtoC(potentialToRealT(baseX0Yp[3])); // temperature of cell above

if(water[3] > 0.0 && realTemp > 0.0){ // snow melting on ground
float melting = min(realTemp * 0.01, water[3]);
water[3] -= melting;
//water[2] += melting; // melting snow makes vegetation
}

if(water[2] > 0.0 && realTemp > 0.0){ // water evaporating from ground
float evaporation = min((1.0 - relativeHumd(CtoK(realTemp), waterX0Yp[0])) * realTemp * 0.0001, water[2]);
water[2] -= evaporation;
}
}else{ // cell above is also wall
water[2] = -999.0; // indicate non surface layer
}
}

// USER INPUT:

bool inBrush = false;

if (userInputValues.x < -0.5){ // whole width brush
if(abs(userInputValues.y - texCoord.y) < userInputValues[3] * texelSize.y)
inBrush = true;
}else{
vec2 distFromMouse = userInputValues.xy - texCoord;
distFromMouse.x *= texelSize.y / texelSize.x; // aspect ratio correction to make it a circle

if (length(distFromMouse) < userInputValues[3] * texelSize.y) {
  inBrush = true;
}
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
water = vec4(0.0);

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
      water[3] = 0.0;
      }
    }
  }
}
if(wall[1] == 0){ // is wall
base[3] = 999.0; // special temperature, just to identify that it is a wall cell when drawing the graph
}else{ // no wall

if(texCoord.y > 0.99) // dry the top edge and prevent snow from passing trough
water = vec4(0.0);

water[1] = max(water[0] - maxWater(realTemp + actualTempChange), 0.0); // recalculate cloud water
}
}

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/