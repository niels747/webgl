#version 300 es
precision highp float;

in vec2 fragTexCoord;
uniform sampler2D sampler;
out vec4 cell;

uniform vec2 resolution;

const float L = 1.42; // constant that determines the relationship between pressure and velocity. Simulation becomes unstabe when <= sqrt(2)

/* 
// The textures contain 4 floats per fragment/pixel:
[0] = vx    Horizontal velocity
[1] = vy    Vertical   velocity
[2] = p     Pressure
[3] = t     Temperature
*/

void main()
{
  cell = texture(sampler, fragTexCoord); // this cell
  vec4 cellx1y0 = texture(sampler, fragTexCoord + vec2(1.0, 0.0) / resolution); // one cell to the right >
  vec4 cellx0y1 = texture(sampler, fragTexCoord + vec2(0.0, 1.0) / resolution); // one cell up ^
  
  bool isWall = false;

   // set walls
  if(fragTexCoord.y * resolution.y < 1.00){ // bottem
  isWall = true;
  }else if(fragTexCoord.x * resolution.x < 1.0){ // left side
  isWall = true;
  }

  if(isWall)
  {
  cell[0] = 0.0;
  cell[1] = 0.0;
  cell[3] = 0.0;
  }else{

  // The velocity through the cell changes proportionally to the pressure gradient across the cell. It's basically just newtons 2nd law.
  cell[0] += (cell[2] - cellx1y0[2]) / L;
  cell[1] += (cell[2] - cellx0y1[2]) / L;

// change temperature
if(fragTexCoord.x > 0.1 && fragTexCoord.x < 0.9){
  if(fragTexCoord.y < 0.06)
  cell[3] += 0.0002;
  else if(fragTexCoord.y > 0.95){
  cell[3] -= 0.0002;
  }
}



  cell[0] *= 0.9999; // drag to prevent to high velocities
  cell[1] *= 0.9999;
  cell[1] += cell[3] * 0.0001; // gravity for convection






  }
}

