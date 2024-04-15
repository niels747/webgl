#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;

in vec2 texCoord;
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

in vec2 texCoordXmYp; // left up
in vec2 texCoordXpYm; // right down

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;

uniform vec4 userInputValues; // xpos   Ypos   intensity   Size    
uniform int userInputType;

uniform float dryLapse; 
uniform float evapHeat;
uniform float meltingHeat;

layout(location=0) out vec4 base;
layout(location=1) out vec4 water;
layout(location=2) out ivec2 wall;

uniform vec2 resolution;

vec2 texelSize;

uniform float initial_T[500];

#include functions


void main()
{
  wall = texture(wallTex, texCoord).xy;

  texelSize = vec2(1) / resolution;

  float actualTempChange = 0.0, realTemp;

  if(wall[1] != 0){ // not wall

  vec4 cellX0Y0 = texture(baseTex, texCoord);
  vec4 cellXmY0 = texture(baseTex, texCoordXmY0);
  vec4 cellX0Ym = texture(baseTex, texCoordX0Ym);
  vec4 cellXpY0 = texture(baseTex, texCoordXpY0); 
  vec4 cellX0Yp = texture(baseTex, texCoordX0Yp);

  vec4 cellXmYp = texture(baseTex, texCoordXmYp); 
  vec4 cellXpYm = texture(baseTex, texCoordXpYm);

  // calculate velocities for different positions within cell
  vec2 velAtP = vec2((cellXmY0.x + cellX0Y0.x)/2., (cellX0Ym.y + cellX0Y0.y)/2.); // center of cell
  vec2 velAtVx = vec2(cellX0Y0.x, (cellX0Ym.y + cellXpY0.y + cellX0Y0.y + cellXpYm.y)/4.); // midle of right edge of cell
  vec2 velAtVy = vec2((cellXmY0.x + cellX0Yp.x + cellXmYp.x + cellX0Y0.x)/4., cellX0Y0.y); // midle of top edge of cell

// ADVECT AIR:

  //vec4 prevBase = texture(baseTex, texCoord);

  base[0] = bilerp(baseTex, fragCoord - velAtVx)[0]; // Vx
  base[1] = bilerp(baseTex, fragCoord - velAtVy)[1]; // Vy

 //base = bilerp(baseTex, fragCoord - cellX0Y0.xy);

  base[2] = bilerp(baseTex, fragCoord - velAtP)[2]; // centered
  base[3] = bilerpWall(baseTex, wallTex, fragCoord - velAtP)[3]; // centered

  water.xyw = bilerpWall(waterTex, wallTex, fragCoord - velAtP).xyw; // centered

  //water.z = bilerpWall(waterTex, wallTex, fragCoord + vec2(0.0, +0.01)).z; // precipitation visualization
  water.z = texture(waterTex, texCoord).z; // precipitation visualization

  vec2 backTracedPos = fragCoord - velAtP; // advect / flow

  //vec2 backTracedPos = texCoord; // no flow

  //water.xy = bilerp(waterTex, backTracedPos).xy;

  realTemp = potentialToRealT(base[3]);

  float newCloudWater = max(water[0] - maxWater(realTemp), 0.0); // calculate cloud water

  float dT = (newCloudWater - water[1]) * evapHeat; // how much that water phase change would change the temperature

  float dWt = max(water[0] - maxWater(realTemp + dT), 0.0) - newCloudWater; // how much that temperature change would change the amount of liquid water

  actualTempChange = dT_saturated(dT, dWt * evapHeat);

  base[3] += actualTempChange;  // APPLY LATENT HEAT!

  realTemp += actualTempChange;

  float tempC = KtoC(realTemp);

  float relHum = relativeHumd(realTemp, water[0]);

  

// Radiative cooling and heating effects

if(texCoord.y > 0.5 ){
  water[0] -= 0.00003; // drying 0.00001
if(texCoord.y > 0.9){

  base[3] -= (KtoC(realTemp) - -55.0) * 0.001; // stratosperic heating

}
}

// water[0] -= max(water[1] - 0.1, 0.0) * 0.0001; // Precipitation effect drying !

water[0] = max(water[0], 0.0); // prevent water from going negative
  

}else{ // this is wall

base = texture(baseTex, texCoord); // pass trough

water = texture(waterTex, texCoord);

ivec2 wallX0Yp = texture(wallTex, texCoordX0Yp).xy;

if(wallX0Yp[1] != 0){ // cell above is not wall

water[2] = max(water[2], 0.0); 

vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);
vec4 waterX0Yp = texture(waterTex, texCoordX0Yp);

float tempC = KtoC(potentialToRealT(baseX0Yp[3])); // temperature of cell above

if(water[3] > 0.0 && tempC > 0.0){ // snow melting on ground
float melting = min(tempC * 0.0003, water[3]);
water[3] -= melting;
//water[2] += melting; // melting snow makes vegetation
}

if(water[2] > 0.0 && tempC > 0.0){ // water evaporating from ground
//float evaporation = min((1.0 - relativeHumd(CtoK(tempC), waterX0Yp[0])) * 0.005, water[2]);
float evaporation = max((maxWater(CtoK(tempC)) - water[0]) * 0.00002, 0.); // water evaporating from land
water[2] -= evaporation;
}
}else{ // cell above is also wall
water[2] = -999.0; // indicate non surface layer
}
}

// USER INPUT:

bool inBrush = false; // if cell is in brush area

if (userInputValues.x < -0.5){ // whole width brush
if(abs(userInputValues.y - texCoord.y) < userInputValues[3] * texelSize.y)
inBrush = true;
}else{
vec2 distFromMouse = userInputValues.xy - texCoord;
distFromMouse.x *= texelSize.y / texelSize.x; // aspect ratio correction to make it a circle

if (length(distFromMouse) < (userInputValues[3] * 0.5 + 0.05) * texelSize.y) {
  inBrush = true;
}
}

if(inBrush){
  if (userInputType == 1) { // temperature
    base[3] += userInputValues[2];
  } else if (userInputType == 2) { // water
    water[0] += userInputValues[2];
    water[0] = max(water[0], 0.0);
  }else if (userInputType == 3) { // smoke
    water[3] += userInputValues[2];
    water[3] = max(water[3], 0.0);

  }else if (userInputType >= 10) { // wall
    if (userInputValues[2] > 0.0) { // build wall if positive value else remove wall

bool setWall = false;


switch(userInputType){ // set wall type
case 10:
wall[0] = 0; // normal wall
setWall = true;
break;
case 11: 
wall[0] = 1; // land
setWall = true;
break;
case 12: 
wall[0] = 2; // lake / sea
setWall = true;
break;
case 13: 
if(wall[1] == 0 && wall[0] == 1 && texture(wallTex, texCoordX0Yp)[1] != 0){ // if land wall and no wall above
wall[0] = 3; // Fire
setWall = true;
}
break;
}

if(setWall){
wall[1] = 0; // set wall
water = vec4(0.0);
}
    } else {
if(wall[1] == 0){ // remove wall only if it is a wall and not bottem layer

if(userInputType == 13){
  if(wall[0] == 3) // extinguish fire
    wall[0] = 1; 
}else if(texCoord.y > texelSize.y){

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
}



if(wall[1] == 0){ // is wall
base[3] = 999.0; // special temperature, just to identify that it is a wall cell when drawing the graph
}else{ // no wall

if(texCoord.y > 0.99) // dry the top edge and prevent snow from passing trough
water = vec4(0.0);



water[1] = max(water[0] - maxWater(realTemp), 0.0); // recalculate cloud water
}
}

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/