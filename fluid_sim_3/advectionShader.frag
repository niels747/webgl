#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D baseTex;
uniform isampler2D wallTex;

layout(location=0) out vec4 cell;
layout(location=1) out ivec2 wall;

uniform vec2 texelSize;

void main()
{
  wall = texture(wallTex, texCoord).xy;
  vec4 prevCell = texture(baseTex, texCoord);

  vec2 backTracedPos =  texCoord - vec2(prevCell[0], prevCell[1]) * texelSize;

  cell = texture(baseTex, backTracedPos); // the cell is set to a linear texture sample, taken at coordinates upwind of this cell
}

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/