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
uniform sampler2D curlTex;
uniform isampler2D wallTex;

uniform vec2 texelSize;
uniform float vorticity;
uniform float wallHeating;

layout(location=0) out vec4 cell;
layout(location=1) out ivec2 wall; // walltype    distto nearest wall

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/


void main()
{
  cell = texture(baseTex, texCoord);

  wall = texture(wallTex, texCoord).xy;
  ivec2 wallXmY0 = texture(wallTex, texCoordXmY0).xy;
  ivec2 wallX0Ym = texture(wallTex, texCoordX0Ym).xy;
  ivec2 wallXpY0 = texture(wallTex, texCoordXpY0).xy; 
  ivec2 wallX0Yp = texture(wallTex, texCoordX0Yp).xy;

  bool nextToWall = false;

  if(wallX0Ym[0] != 0){
    cell.y = min(0.0, cell.y);
    nextToWall = true;
  } if(wallX0Yp[0] != 0){
    cell.y = max(0.0, cell.y);
    nextToWall = true;
  }
   if(wallXmY0[0] != 0){
    cell.x = min(0.0, cell.x);
    nextToWall = true;
  } if(wallXpY0[0] != 0){
    cell.x = max(0.0, cell.x);
    nextToWall = true;
  }

  if(nextToWall){ // average with neighboring cells to prevent temperature from sticking to walls

  wall[1] = 1; // dist to nearest wall = 1
  }
  else{ // not next to wall
  if(wall[0] == 0){ // is not wall

  wall[1] = wallX0Ym[1] + 1; // add one to dist to ground
    
    if(wall[1] > 0 && wall[1] < 10){ // wall heating
    cell[3] += wallHeating; 
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
      force *= vorticity * curl; // 0.002
      cell.xy += force; // add force to velocity
    }
  }
  }

  if(wall[1] < 4){ // apply difusion of temperature close to walls
    float tempExchange = 0.0;
    int divider = 0;
    
if(wallX0Yp[0] == 0){
  tempExchange += texture(baseTex, texCoordX0Yp)[3];
  divider ++;
  } 
  
  if(wallX0Ym[0] == 0){
   tempExchange += texture(baseTex, texCoordX0Ym)[3];
    divider ++;
  }
  
   if(wallXmY0[0] == 0){
  tempExchange += texture(baseTex, texCoordXmY0)[3];
    divider ++;
  } 
   if(wallXpY0[0] == 0){
    tempExchange += texture(baseTex, texCoordXpY0)[3];
    divider ++;
  }
  
  float averageTemp = tempExchange / float(divider);

float ratio = 50.0;

cell[3] = (cell[3]*ratio + averageTemp)/(ratio+1.0);
  }

}


