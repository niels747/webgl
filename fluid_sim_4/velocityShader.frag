#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord; // this
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform isampler2D wallTex;

uniform vec4 userInputValues; // xpos   Ypos   intensity   Size    
uniform int userInputType; // 0 = nothing 	1 = temp	 2 = wall	3 = heating wall	4 = cooling wall

uniform float dragMultiplier;

uniform vec2 texelSize;

layout(location=0) out vec4 cell;
layout(location=1) out ivec2 wall;



/* 
// The textures contain 4 floats per fragment/pixel:
[0] = vx    Horizontal velocity
[1] = vy    Vertical   velocity
[2] = p     Pressure
[3] = t     Temperature
*/

void main()
{
  cell = texture(baseTex, texCoord);
  vec4 cellXpY0 = texture(baseTex, texCoordXpY0); 
  vec4 cellX0Yp = texture(baseTex, texCoordX0Yp);

  wall = texture(wallTex, texCoord).xy;
  
  if(wall[1] == 0) // is wall
  {
  cell[0] = 0.0; // velocities in wall are 0
  cell[1] = 0.0; // this will make a wall not let any pressure trough and thereby reflect any pressure waves back
  }else{

  // The velocity through the cell changes proportionally to the pressure gradient across the cell. It's basically just newtons 2nd law.
  cell[0] += (cell[2] - cellXpY0[2]) / 2.0;
  cell[1] += (cell[2] - cellX0Yp[2]) / 2.0;

  //cell[0] *= 0.9999; // linear ristance to prevent to high velocities
 // cell[1] *= 0.9999;

  // quadratic resistance
  cell[0] -= abs(cell[0]) * cell[0] * dragMultiplier;
  cell[1] -= abs(cell[1]) * cell[1] * dragMultiplier;

  cell[1] += cell[3] * 0.0003; // 0.0001 gravity for convection
}


// USER INPUT:

vec2 distFromMouse = userInputValues.xy - texCoord;
distFromMouse.x *= texelSize.y / texelSize.x; // aspect ratio correction to make it a circle

if(texCoord.y > texelSize.y){ // prevent changing of bottem wall layer
if (length(distFromMouse) < userInputValues[3] * texelSize.y) {
  if (userInputType == 1) { // temperature
    cell[3] += userInputValues[2];
  } else if (userInputType > 1) { // wall
    if (userInputValues[2] > 0.0) { // build wall if positive value else remove wall

wall[1] = 0; // set wall

switch(userInputType){ // set wall type
case 2: wall[0] = 0; // normal wall
break;
case 3: wall[0] = 1; // heating wall
break;
case 4: wall[0] = 2; // cooling wall
}
    } else {
if(wall[1] == 0){ // only if it is a wall
      wall[1] = 255; // remove wall
      cell[0] = 0.0; // reset all properties to prevent NaN bug
      cell[1] = 0.0;
      cell[2] = 0.0; 
      cell[3] = 0.0;
      }
    }
  }
}
}
// limit temperature from -1 to 1
cell[3] = min(max(cell[3], -1.0),1.0);


if(wall[1] == 0)
cell[3] = 999.0; // special temperature, just to identify that it is a wall cell in the graph function
}

