#version 300 es
precision highp float;

in vec2 fragTexCoord;
uniform sampler2D sampler;
out vec4 cell;

uniform vec2 resolution;

const float L = 1.42;

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/

void main()
{
  cell = texture(sampler, fragTexCoord);
  vec4 cellxm1y0 = texture(sampler, fragTexCoord + vec2(-1.0, 0.0) / resolution);
  vec4 cellx0ym1 = texture(sampler, fragTexCoord + vec2(0.0, -1.0) / resolution);

  cell[2] += (cellxm1y0[0] - cell[0] + cellx0ym1[1] - cell[1]) / L; // pressure changes proportional to the net in or outflow, to or from the cell.
}

