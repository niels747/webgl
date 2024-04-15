#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord; // this
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down

uniform sampler2D baseTex;
uniform isampler2D wallTex;

layout(location=0) out vec4 cell;
layout(location=1) out ivec2 wall;

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/

void main()
{
  cell = texture(baseTex, texCoord);
  vec4 cellXmY0 = texture(baseTex, texCoordXmY0);
  vec4 cellX0Ym = texture(baseTex, texCoordX0Ym);

  wall = texture(wallTex, texCoord).xy;

  cell[2] += cellXmY0[0] - cell[0] + cellX0Ym[1] - cell[1]; // pressure changes proportional to the net in or outflow, to or from the cell.
}

