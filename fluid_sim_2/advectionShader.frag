#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 fragTexCoord;
uniform sampler2D sampler;
out vec4 cell;

uniform vec2 resolution;

void main()
{
  vec4 prevCell = texture(sampler, fragTexCoord);

  cell = texture(sampler, fragTexCoord - vec2(prevCell[0], prevCell[1]) / resolution); // the cell is set to a linear texture sample, taken at coordinates upwind of this cell
}

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/