#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord; // this
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform sampler2D curlTex;
uniform isampler2D wallTex;

uniform float dryLapse; 
uniform float evapHeat;

uniform vec2 texelSize;
uniform float vorticity;
uniform float landHeating;
uniform float waterTemperature;
uniform float waterEvaporation;
uniform float landEvaporation;
uniform float waterWeight;

layout(location=0) out vec4 base;
layout(location=1) out vec4 water;
layout(location=2) out ivec2 wall; // [0]walltype    [1]distance to nearest wall

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/

#include functions

void main()
{
  base = texture(baseTex, texCoord);
  water = texture(waterTex, texCoord);

  wall = texture(wallTex, texCoord).xy;
  ivec2 wallXmY0 = texture(wallTex, texCoordXmY0).xy;
  ivec2 wallX0Ym = texture(wallTex, texCoordX0Ym).xy;
  ivec2 wallXpY0 = texture(wallTex, texCoordXpY0).xy; 
  ivec2 wallX0Yp = texture(wallTex, texCoordX0Yp).xy;

  bool nextToWall = false;

  if(texCoord.y < 0.9 && wallX0Yp[1] == 0) // if wall above
  wall[1] = 0; //  set this to wall

  if(wall[1] != 0){ // is not wall

  base[1] -= (water[1] + water[2] + water[3]) * waterWeight;

  if(wallX0Ym[1] == 0){ // limit velocities near walls
    base.y = min(0.0, base.y);
    nextToWall = true;
    wall[0] = wallX0Ym[0]; // copy wall type from wall below
  } if(wallX0Yp[1] == 0){
    base.y = max(0.0, base.y);
    nextToWall = true;
    wall[0] = wallX0Yp[0];
    
  }if(wallXmY0[1] == 0){
    base.x = min(0.0, base.x);
   // base.x = 0.0;
    nextToWall = true;
    wall[0] = wallXmY0[0];
  } if(wallXpY0[1] == 0){
    base.x = max(0.0, base.x);
    //base.x = 0.0;
    nextToWall = true;
    wall[0] = wallXpY0[0];
  }

  if(nextToWall){
   // wall[0] = wallX0Ym[0]; // type = type of down wall
    wall[1] = 1; // dist to nearest wall = 1
  }
  else{ // not next to wall
// find nearest wall
  int nearest = 255;
  int nearestType = 0;
  if(wallX0Ym[1] < nearest){
nearest = wallX0Ym[1];
nearestType = wallX0Ym[0];
  }
  wall[1] = nearest + 1; // add one to dist to wall
  wall[0] = nearestType; // type = type of nearest wall
  
//  wall[1] = wallX0Ym[1] + 1; // add one to dist to wall
//  wall[0] = wallX0Ym[0]; // type = type of nearest wall
    
    if(wall[1] < 5){ // within range of wall

    float realTemp = potentialToRealT(base[3]);

    if(wall[0] == 1){ // land
      base[3] += landHeating; 
      if(KtoC(realTemp) > 0.0){
      water[0] += landEvaporation * max((0.90 - relativeHumd(realTemp, water[0])),0.0);
     }
    }else if(wall[0] == 2){ // water
      base[3] += (waterTemperature - realTemp) * 0.0001;

      water[0] += waterEvaporation * max((0.95 - relativeHumd(realTemp, water[0])),0.0);
    }

    base[0] *= 0.9995; // surface drag
    }


    // apply vorticity
    float curl = texture(curlTex, texCoord)[0];
    float curlXmY0 = texture(curlTex, texCoordXmY0)[0];
    float curlX0Ym = texture(curlTex, texCoordX0Ym)[0];
    float curlXpY0 = texture(curlTex, texCoordXpY0)[0]; 
    float curlX0Yp = texture(curlTex, texCoordX0Yp)[0];

    vec2 force = vec2(abs(curlX0Ym) - abs(curlX0Yp), abs(curlXpY0) - abs(curlXmY0));
    float magnitude = length(force);

    if(magnitude != 0.0){ // prevent divide by 0
      force /= magnitude; // normalize vector
      force *= vorticity * curl;
      base.xy += force; // add force to velocity
    }
  }
  

  if(wall[1] < 2){ // apply difusion of temperature close to walls
    float tempExchange = 0.0;
    float waterExchange = 0.0;
    float ratio = 50.0; // lower makes it faster
    int divider = 0;
    
  if(wallX0Yp[1] != 0){ // not wall
  tempExchange += texture(baseTex, texCoordX0Yp)[3];
  waterExchange += texture(waterTex, texCoordX0Yp)[0];
  divider ++;
  }
  
  if(wallX0Ym[1] != 0){
   tempExchange += texture(baseTex, texCoordX0Ym)[3];
   waterExchange += texture(waterTex, texCoordX0Ym)[0];
    divider ++;
  }
  
   if(wallXmY0[1] != 0){
  tempExchange += texture(baseTex, texCoordXmY0)[3];
  waterExchange += texture(waterTex, texCoordXmY0)[0];
    divider ++;
  } 
   if(wallXpY0[1] != 0){
    tempExchange += texture(baseTex, texCoordXpY0)[3];
    waterExchange += texture(waterTex, texCoordXpY0)[0];
    divider ++;
  }
  
  float averageTemp = tempExchange / float(divider);
  base[3] = (base[3]*ratio + averageTemp)/(ratio+1.0);

  float averageWater = waterExchange / float(divider);
  water[0] = (water[0]*ratio + averageWater)/(ratio+1.0);
  }

  }
}


